import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { extractCwd, extractSessionId } from "./hook-io.mjs";
import { stateDirRelative } from "./policy.mjs";

const VERSION = 1;

export function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function emptyState() {
  return {
    version: VERSION,
    phase: "idle", // idle | armed
    enteredAt: 0,
    updatedAt: 0,
    runId: null,
    objective: null,
    stopAttempts: 0,
    lastCloseReason: null,
  };
}

export function statePath(event, auditRoot = ".goal-task") {
  const cwd = resolve(extractCwd(event));
  const session = extractSessionId(event) ?? "default";
  return join(cwd, stateDirRelative(auditRoot), `${digest(session)}.json`);
}

function isDormant(state) {
  return (
    state.phase === "idle" &&
    !state.runId &&
    !state.objective &&
    !state.lastCloseReason &&
    Number(state.enteredAt || 0) === 0
  );
}

function ensureStateDir(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const ignore = join(directory, ".gitignore");
  if (!existsSync(ignore)) {
    writeFileSync(ignore, "*\n", { encoding: "utf8", mode: 0o600 });
  }
}

function readStateFile(path) {
  if (!path) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || parsed.version !== VERSION) {
      return emptyState();
    }
    const base = emptyState();
    return {
      ...base,
      ...parsed,
      version: VERSION,
      phase: ["idle", "armed"].includes(parsed.phase) ? parsed.phase : "idle",
      enteredAt: Number(parsed.enteredAt) || 0,
      updatedAt: Number(parsed.updatedAt) || 0,
      stopAttempts: Number(parsed.stopAttempts) || 0,
      runId: typeof parsed.runId === "string" ? parsed.runId : null,
      objective: typeof parsed.objective === "string" ? parsed.objective : null,
    };
  } catch {
    return emptyState();
  }
}

function writeStateFile(path, state) {
  if (!path) return false;
  const directory = dirname(path);
  const temporary = join(
    directory,
    `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`,
  );
  try {
    ensureStateDir(directory);
    writeFileSync(temporary, `${JSON.stringify(state)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, path);
    return true;
  } catch {
    try {
      rmSync(temporary, { force: true });
    } catch {
      // ignore
    }
    return false;
  }
}

export function readState(event, auditRoot = ".goal-task") {
  return readStateFile(statePath(event, auditRoot));
}

export function updateState(event, updater, auditRoot = ".goal-task") {
  const path = statePath(event, auditRoot);
  if (!path) {
    const ephemeral = emptyState();
    return updater(ephemeral);
  }
  try {
    const state = readStateFile(path);
    const result = updater(state);
    state.updatedAt = Date.now();
    if (isDormant(state) && !existsSync(path)) {
      return result;
    }
    if (!writeStateFile(path, state)) {
      return result;
    }
    return result;
  } catch {
    return updater(emptyState());
  }
}
