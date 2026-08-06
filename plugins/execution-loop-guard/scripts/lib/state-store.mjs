import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { extractCwd, extractSessionId } from "./hook-io.mjs";

const VERSION = 1;

export function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function dataRoot() {
  return process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA ?? null;
}

function statePath(event) {
  const root = dataRoot();
  if (!root) return null;
  const cwd = resolve(extractCwd(event));
  const session = extractSessionId(event) ?? `cwd:${cwd}`;
  return join(resolve(root), "execution-loop-guard", `${digest(`${session}\0${cwd}`)}.json`);
}

function emptyState() {
  return { version: VERSION, updatedAt: 0, edits: {}, command: null, polling: null };
}

function readState(path) {
  if (!path) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || parsed.version !== VERSION || typeof parsed !== "object") return emptyState();
    return {
      version: VERSION,
      updatedAt: Number(parsed.updatedAt) || 0,
      edits: parsed.edits && typeof parsed.edits === "object" && !Array.isArray(parsed.edits) ? parsed.edits : {},
      command: parsed.command && typeof parsed.command === "object" ? parsed.command : null,
      polling: parsed.polling && typeof parsed.polling === "object" ? parsed.polling : null,
    };
  } catch {
    return emptyState();
  }
}

function writeState(path, state) {
  if (!path) return false;
  const directory = dirname(path);
  const temporary = join(directory, `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
    return true;
  } catch {
    try { rmSync(temporary, { force: true }); } catch {}
    return false;
  }
}

export function updateState(event, updater) {
  const path = statePath(event);
  if (!path) return null;
  try {
    const state = readState(path);
    const result = updater(state);
    state.updatedAt = Date.now();
    if (!writeState(path, state)) return null;
    return result;
  } catch {
    return null;
  }
}

export function inspectState(event) {
  const path = statePath(event);
  return path ? readState(path) : null;
}
