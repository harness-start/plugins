import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const VERSION = 3;
export const STATE_DIR_RELATIVE = ".tdd-guard/.state";

export function digest(value) { return createHash("sha256").update(String(value)).digest("hex"); }

function ensureStateDir(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const ignore = join(directory, ".gitignore");
  if (!existsSync(ignore)) {
    writeFileSync(ignore, "*\n", { encoding: "utf8", mode: 0o600 });
  }
}

function statePath(sessionId, root) {
  const session = sessionId || "default";
  return join(resolve(root), STATE_DIR_RELATIVE, `${digest(session)}.json`);
}

export function readState(sessionId, root) {
  const path = statePath(sessionId, root);
  if (!path) return { version: VERSION, sequence: 0, pending: null, tests: [], needsGreen: null };
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (value?.version !== VERSION) throw new Error("version mismatch");
    return value;
  } catch {
    return { version: VERSION, sequence: 0, pending: null, tests: [], needsGreen: null };
  }
}

export function writeState(sessionId, root, state) {
  const path = statePath(sessionId, root);
  if (!path) return false;
  const directory = dirname(path);
  const temporary = join(directory, `.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    ensureStateDir(directory);
    writeFileSync(temporary, `${JSON.stringify({ ...state, version: VERSION })}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
    return true;
  } catch {
    try { rmSync(temporary, { force: true }); } catch {}
    return false;
  }
}
