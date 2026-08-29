import { createHash, randomBytes } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { isRecord } from "@harness/core/hook-event";
import { ensurePluginWorkdirGitignore } from "@harness/core/plugin-workdir";

const VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000;
export const STATE_DIR_RELATIVE = ".debug-workflow/.state";

export type Receipt = {
  id: string;
  bugId?: unknown;
  kind?: unknown;
  commandHash?: unknown;
  paths?: unknown;
  outcome?: unknown;
  summary?: unknown;
  mutationSeq?: unknown;
  revision?: unknown;
  at?: unknown;
  [key: string]: unknown;
};

export type SessionState = {
  version: number;
  bound: boolean;
  workOrderPath: string | null;
  workOrderId: string | null;
  epoch: number;
  activeBugId: string | null;
  revision: number;
  eventSeq: number;
  mutationSeq: number;
  receipts: Receipt[];
  attempts: Record<string, number>;
  invalid: boolean;
  updatedAt: number;
};

export type AcquireLeaseInput = {
  repoRoot: string;
  workOrderId: string;
  epoch: unknown;
  sessionId: string | null;
  leaseMinutes: number;
  now?: number;
};

export type AcquireLeaseResult = {
  ok: boolean;
  persisted?: boolean;
  reason?: string;
};

export type ReleaseLeaseInput = {
  repoRoot: string;
  workOrderId: string;
  sessionId: string | null;
};

export function digest(value: unknown): string {
  return createHash("sha256").update(String(value)).digest("hex");
}

function debugWorkdir(from: string): string | null {
  let cursor = resolve(from);
  while (basename(cursor) !== ".debug-workflow") {
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
  return cursor;
}

function ensureStateDir(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const workdir = debugWorkdir(directory);
  if (workdir) ensurePluginWorkdirGitignore(workdir);
}

export function emptyState(): SessionState {
  return { version: VERSION, bound: false, workOrderPath: null, workOrderId: null, epoch: 0, activeBugId: null, revision: 0, eventSeq: 0, mutationSeq: 0, receipts: [], attempts: {}, invalid: false, updatedAt: 0 };
}

function asReceipts(value: unknown): Receipt[] {
  if (!Array.isArray(value)) return [];
  const receipts: Receipt[] = [];
  for (const item of value.slice(-1000)) {
    if (isRecord(item)) receipts.push({ ...item, id: typeof item.id === "string" ? item.id : String(item.id ?? "") });
    else receipts.push({ id: "", value: item });
  }
  return receipts;
}

function asAttempts(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const attempts: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) attempts[key] = Number(count);
  return attempts;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

function sanitize(value: unknown): SessionState {
  if (!isRecord(value) || value.version !== VERSION || Date.now() - Number(value.updatedAt || 0) > TTL_MS) return emptyState();
  return {
    ...emptyState(),
    bound: Boolean(value.bound),
    workOrderPath: nullableString(value.workOrderPath),
    workOrderId: nullableString(value.workOrderId),
    epoch: Number(value.epoch) || 0,
    activeBugId: nullableString(value.activeBugId),
    revision: Number(value.revision) || 0,
    eventSeq: Number(value.eventSeq) || 0,
    mutationSeq: Number(value.mutationSeq) || 0,
    receipts: asReceipts(value.receipts),
    attempts: asAttempts(value.attempts),
    invalid: Boolean(value.invalid),
    updatedAt: Number(value.updatedAt) || 0,
  };
}

function statePath(sessionId: string | null | undefined, cwd: string): string {
  const session = sessionId || "default";
  return join(resolve(cwd), STATE_DIR_RELATIVE, "sessions", `${digest(session)}.json`);
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string" ? error.code : undefined;
}

function withLock<T>(path: string, operation: () => T): T {
  const lockPath = `${path}.lock`;
  ensureStateDir(dirname(path));
  let fd: number | undefined;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { fd = openSync(lockPath, "wx", 0o600); break; }
    catch (error: unknown) {
      if (errorCode(error) !== "EEXIST" || attempt === 39) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  try { return operation(); }
  finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(lockPath, { force: true });
  }
}

function atomicWrite(path: string | null | undefined, value: unknown): boolean {
  if (!path) return false;
  const directory = dirname(path);
  const temp = join(directory, `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    ensureStateDir(directory);
    writeFileSync(temp, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temp, path);
    return true;
  } catch {
    try { rmSync(temp, { force: true }); } catch {}
    return false;
  }
}

function read(path: string, fallback: unknown = null): unknown {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed;
  } catch { return fallback; }
}

export function readState(sessionId: string | null | undefined, cwd: string): SessionState {
  return sanitize(read(statePath(sessionId, cwd), null));
}

export function writeState(sessionId: string | null | undefined, cwd: string, state: SessionState): boolean {
  state.updatedAt = Date.now();
  return atomicWrite(statePath(sessionId, cwd), state);
}

export function updateState<T>(sessionId: string | null | undefined, cwd: string, updater: (state: SessionState) => T): { state: SessionState; result: T } {
  const path = statePath(sessionId, cwd);
  return withLock(path, () => {
    const state = readState(sessionId, cwd);
    const result = updater(state);
    state.receipts = state.receipts.slice(-1000);
    writeState(sessionId, cwd, state);
    return { state, result };
  });
}

function registryPath(repoRoot: string, workOrderId: string): string {
  return join(resolve(repoRoot), STATE_DIR_RELATIVE, "leases", `${digest(workOrderId)}.json`);
}

export function acquireLease({ repoRoot, workOrderId, epoch, sessionId, leaseMinutes, now = Date.now() }: AcquireLeaseInput): AcquireLeaseResult {
  const path = registryPath(repoRoot, workOrderId);
  if (!path) return { ok: true, persisted: false };
  const lock = `${path}.lock`;
  const createLock = (): void => {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    mkdirSync(lock, { mode: 0o700 });
  };
  try { createLock(); }
  catch {
    try {
      if (now - statSync(lock).mtimeMs <= 30_000) return { ok: false, reason: "work-order lease update is already in progress" };
      rmdirSync(lock);
      createLock();
    } catch { return { ok: false, reason: "work-order lease update is already in progress" }; }
  }
  try {
    const current = read(path, null);
    const currentRecord = isRecord(current) ? current : null;
    const live = Boolean(currentRecord && Number(currentRecord.expiresAt) > now);
    if (live && currentRecord && currentRecord.sessionId !== sessionId) return { ok: false, reason: `work order is leased by another session until ${new Date(Number(currentRecord.expiresAt)).toISOString()}` };
    if (currentRecord && currentRecord.sessionId !== sessionId && Number(epoch) <= Number(currentRecord.maxEpoch || 0)) return { ok: false, reason: `run.epoch must exceed ${String(currentRecord.maxEpoch)} when another session resumes this work order` };
    const next = { workOrderId, maxEpoch: Math.max(Number(epoch), Number(currentRecord?.maxEpoch || 0)), sessionId, expiresAt: now + leaseMinutes * 60_000, updatedAt: now };
    return { ok: atomicWrite(path, next), persisted: true, reason: "failed to persist work-order lease" };
  } finally {
    try { rmdirSync(lock); } catch {}
  }
}

export function releaseLease({ repoRoot, workOrderId, sessionId }: ReleaseLeaseInput): boolean {
  const path = registryPath(repoRoot, workOrderId);
  if (!path) return false;
  const current = read(path, null);
  if (!isRecord(current) || current.sessionId !== sessionId) return false;
  current.expiresAt = 0;
  return atomicWrite(path, current);
}
