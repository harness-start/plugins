import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { ensurePluginWorkdirGitignore } from "@harness/core/plugin-workdir";
import { atomicWriteJson, digestKey, withPathLock } from "@harness/core/state-file";

import { extractCwd, extractSessionId } from "./hook-io.js";

const VERSION = 1;
export const STATE_DIR_RELATIVE = ".execution-loop-guard/state";

export function digest(value) {
  return digestKey(value);
}

function ensureStateDir(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  ensurePluginWorkdirGitignore(dirname(directory));
}

function statePath(event) {
  const cwd = resolve(extractCwd(event));
  const session = extractSessionId(event) ?? "default";
  return join(cwd, STATE_DIR_RELATIVE, `${digest(session)}.json`);
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
  ensureStateDir(dirname(path));
  return withPathLock(path, () => atomicWriteJson(path, state));
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
