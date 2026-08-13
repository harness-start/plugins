import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000;
export const STATE_DIR_RELATIVE = ".debug-workflow/.state";

export function digest(value) { return createHash("sha256").update(String(value)).digest("hex"); }

function ensureStateDir(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const ignore = join(directory, ".gitignore");
  if (!existsSync(ignore)) {
    writeFileSync(ignore, "*\n", { encoding: "utf8", mode: 0o600 });
  }
}

export function emptyState() {
  return { version: VERSION, bound: false, workOrderPath: null, workOrderId: null, epoch: 0, activeBugId: null, revision: 0, eventSeq: 0, mutationSeq: 0, receipts: [], attempts: {}, reviews: { reservation: null, diagnosis: null, architecture: null }, invalid: false, updatedAt: 0 };
}

function sanitize(value) {
  if (!value || value.version !== VERSION || Date.now() - Number(value.updatedAt || 0) > TTL_MS) return emptyState();
  return {
    ...emptyState(),
    ...value,
    receipts: Array.isArray(value.receipts) ? value.receipts.slice(-1000) : [],
    attempts: value.attempts && typeof value.attempts === "object" ? value.attempts : {},
  };
}

function statePath(sessionId, cwd) {
  const session = sessionId || "default";
  return join(resolve(cwd), STATE_DIR_RELATIVE, "sessions", `${digest(session)}.json`);
}

function withLock(path, operation) {
  const lockPath = `${path}.lock`;
  ensureStateDir(dirname(path));
  let fd;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { fd = openSync(lockPath, "wx", 0o600); break; }
    catch (error) {
      if (error?.code !== "EEXIST" || attempt === 39) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  try { return operation(); }
  finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(lockPath, { force: true });
  }
}

function atomicWrite(path, value) {
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

function read(path, fallback = null) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}

export function readState(sessionId, cwd) { return sanitize(read(statePath(sessionId, cwd), null)); }

export function writeState(sessionId, cwd, state) {
  state.updatedAt = Date.now();
  return atomicWrite(statePath(sessionId, cwd), state);
}

export function updateState(sessionId, cwd, updater) {
  const path = statePath(sessionId, cwd);
  return withLock(path, () => {
    const state = readState(sessionId, cwd);
    const result = updater(state);
    state.receipts = state.receipts.slice(-1000);
    writeState(sessionId, cwd, state);
    return { state, result };
  });
}

function registryPath(repoRoot, workOrderId) {
  return join(resolve(repoRoot), STATE_DIR_RELATIVE, "leases", `${digest(workOrderId)}.json`);
}

export function acquireLease({ repoRoot, workOrderId, epoch, sessionId, leaseMinutes, now = Date.now() }) {
  const path = registryPath(repoRoot, workOrderId);
  if (!path) return { ok: true, persisted: false };
  const lock = `${path}.lock`;
  const createLock = () => {
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
    const live = current && Number(current.expiresAt) > now;
    if (live && current.sessionId !== sessionId) return { ok: false, reason: `work order is leased by another session until ${new Date(current.expiresAt).toISOString()}` };
    if (current && current.sessionId !== sessionId && Number(epoch) <= Number(current.maxEpoch || 0)) return { ok: false, reason: `run.epoch must exceed ${current.maxEpoch} when another session resumes this work order` };
    const next = { workOrderId, maxEpoch: Math.max(Number(epoch), Number(current?.maxEpoch || 0)), sessionId, expiresAt: now + leaseMinutes * 60_000, updatedAt: now };
    return { ok: atomicWrite(path, next), persisted: true, reason: "failed to persist work-order lease" };
  } finally {
    try { rmdirSync(lock); } catch {}
  }
}

export function releaseLease({ repoRoot, workOrderId, sessionId }) {
  const path = registryPath(repoRoot, workOrderId);
  if (!path) return false;
  const current = read(path, null);
  if (!current || current.sessionId !== sessionId) return false;
  current.expiresAt = 0;
  return atomicWrite(path, current);
}
