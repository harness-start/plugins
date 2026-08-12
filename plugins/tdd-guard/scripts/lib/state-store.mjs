import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const VERSION = 1;

export function digest(value) { return createHash("sha256").update(String(value)).digest("hex"); }

function statePath(sessionId, root) {
  const data = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA;
  if (!data) return null;
  return join(resolve(data), "tdd-guard", "sessions", `${digest(`${sessionId}\0${resolve(root)}`)}.json`);
}

export function readState(sessionId, root) {
  const path = statePath(sessionId, root);
  if (!path) return { version: VERSION, sequence: 0, pending: null, tests: [] };
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (value?.version !== VERSION) throw new Error("version mismatch");
    return value;
  } catch {
    return { version: VERSION, sequence: 0, pending: null, tests: [] };
  }
}

export function writeState(sessionId, root, state) {
  const path = statePath(sessionId, root);
  if (!path) return false;
  const directory = dirname(path);
  const temporary = join(directory, `.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(temporary, `${JSON.stringify({ ...state, version: VERSION })}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
    return true;
  } catch {
    try { rmSync(temporary, { force: true }); } catch {}
    return false;
  }
}
