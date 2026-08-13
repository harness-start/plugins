import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { extractCwd, extractSessionId } from "./hook-io.mjs";
import { STATE_DIR_RELATIVE } from "./policy.mjs";

const VERSION = 1;

export function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function resolveProjectRoot(cwd) {
  const base = resolve(cwd || ".");
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: base,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return base;
  }
}

export function emptyState() {
  return {
    version: VERSION,
    phase: "idle",
    enteredAt: 0,
    updatedAt: 0,
    entryToken: null,
    topicPreview: null,
    turnIndex: 0,
    lastUserClass: null,
    lastNote: null,
    closeReason: null,
    ledgerPath: null,
    ledgerRevision: 0,
    ledgerValid: false,
    stopAttempts: 0,
  };
}

export function statePath(event) {
  const cwd = resolve(extractCwd(event));
  const session = extractSessionId(event) ?? "default";
  return join(cwd, STATE_DIR_RELATIVE, `${digest(session)}.json`);
}

function isDormant(state) {
  return (
    state.phase === "idle" &&
    !state.entryToken &&
    !state.ledgerPath &&
    !state.closeReason &&
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
      phase: ["idle", "open", "closed"].includes(parsed.phase) ? parsed.phase : "idle",
      turnIndex: Number(parsed.turnIndex) || 0,
      enteredAt: Number(parsed.enteredAt) || 0,
      updatedAt: Number(parsed.updatedAt) || 0,
      ledgerRevision: Number(parsed.ledgerRevision) || 0,
      ledgerValid: Boolean(parsed.ledgerValid),
      stopAttempts: Number(parsed.stopAttempts) || 0,
      ledgerPath: typeof parsed.ledgerPath === "string" ? parsed.ledgerPath : null,
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

export function readState(event) {
  return readStateFile(statePath(event));
}

export function updateState(event, updater) {
  const path = statePath(event);
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

export function inspectState(event) {
  const path = statePath(event);
  return path ? readStateFile(path) : emptyState();
}

export function __testStatePath(event) {
  return statePath(event);
}
