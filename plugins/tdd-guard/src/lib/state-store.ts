import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { ensurePluginWorkdirGitignore } from "@harness/core/plugin-workdir";
import { atomicWriteJson, digestKey, withPathLock } from "@harness/core/state-file";

const VERSION = 3;
export const STATE_DIR_RELATIVE = ".tdd-guard/state";

export function digest(value) { return digestKey(value); }

function ensureStateDir(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  ensurePluginWorkdirGitignore(dirname(directory));
}

function statePath(sessionId, root) {
  const session = sessionId || "default";
  return join(resolve(root), STATE_DIR_RELATIVE, `${digest(session)}.json`);
}

export function readState(sessionId, root) {
  const path = statePath(sessionId, root);
  if (!path) return { version: VERSION, sequence: 0, pending: null, tests: [], needsGreen: null, observedRed: {} };
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (value?.version !== VERSION) throw new Error("version mismatch");
    return { observedRed: {}, ...value };
  } catch {
    return { version: VERSION, sequence: 0, pending: null, tests: [], needsGreen: null, observedRed: {} };
  }
}

export function writeState(sessionId, root, state) {
  const path = statePath(sessionId, root);
  if (!path) return false;
  ensureStateDir(dirname(path));
  return withPathLock(path, () => atomicWriteJson(path, { ...state, version: VERSION }));
}
