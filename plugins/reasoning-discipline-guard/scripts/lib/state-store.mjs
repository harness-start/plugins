import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const VERSION = 1;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const STATE_DIR_RELATIVE = ".reasoning-discipline/.state";

export function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function ensureStateDir(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const ignore = join(directory, ".gitignore");
  if (!existsSync(ignore)) {
    writeFileSync(ignore, "*\n", { encoding: "utf8", mode: 0o600 });
  }
}

export function emptyState() {
  return {
    version: VERSION,
    bound: false,
    workflowPath: null,
    workflowId: null,
    branch: null,
    epoch: 0,
    status: null,
    nextStageIndex: 0,
    receipts: [],
    invalid: false,
    findings: [],
    updatedAt: 0,
  };
}

function sanitize(value) {
  if (!value || value.version !== VERSION) return emptyState();
  if (Date.now() - Number(value.updatedAt || 0) > TTL_MS) return emptyState();
  return {
    ...emptyState(),
    ...value,
    receipts: Array.isArray(value.receipts) ? value.receipts.slice(-20) : [],
    findings: Array.isArray(value.findings) ? value.findings.slice(-20) : [],
  };
}

function statePath(sessionId, cwd) {
  const session = sessionId || "default";
  return join(resolve(cwd), STATE_DIR_RELATIVE, `${digest(session)}.json`);
}

function withLock(path, operation) {
  const lockPath = `${path}.lock`;
  ensureStateDir(dirname(path));
  let fd;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      fd = openSync(lockPath, "wx", 0o600);
      break;
    } catch (error) {
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
  const temporary = join(
    directory,
    `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`,
  );
  try {
    ensureStateDir(directory);
    writeFileSync(temporary, `${JSON.stringify(value)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, path);
    return true;
  } catch {
    try { rmSync(temporary, { force: true }); } catch {}
    return false;
  }
}

export function readState(sessionId, cwd) {
  const path = statePath(sessionId, cwd);
  if (!path) return emptyState();
  try {
    return sanitize(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return emptyState();
  }
}

export function writeState(sessionId, cwd, state) {
  state.updatedAt = Date.now();
  state.receipts = state.receipts.slice(-20);
  state.findings = state.findings.slice(-20);
  return atomicWrite(statePath(sessionId, cwd), state);
}

export function updateState(sessionId, cwd, updater) {
  const path = statePath(sessionId, cwd);
  return withLock(path, () => {
    const state = readState(sessionId, cwd);
    const result = updater(state);
    writeState(sessionId, cwd, state);
    return { state, result };
  });
}
