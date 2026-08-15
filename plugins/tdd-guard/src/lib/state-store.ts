import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { isRecord } from "@harness/core/hook-event";
import { ensurePluginWorkdirGitignore } from "@harness/core/plugin-workdir";
import { atomicWriteJson, digestKey, withPathLock } from "@harness/core/state-file";

import type { TestEvidence } from "./patterns.js";

const VERSION = 3;
export const STATE_DIR_RELATIVE = ".tdd-guard/state";

export type PendingTarget = {
  path: string;
  beforeHash: string;
  language?: string;
};

export type PendingState = {
  kind: "source" | "test" | "revert";
  toolUseId: string;
  targets: PendingTarget[];
  testPaths?: string[];
};

export type StoredTestRecord = {
  path: string;
  language: string;
  hash: string;
  sequence: number;
  created: boolean;
  evidence: TestEvidence;
  redHash?: string;
};

export type NeedsGreen = {
  paths: string[];
  testPaths: string[];
};

export type LastRed = {
  commandHash: string;
  testHashes: string[];
};

export type GuardState = {
  version: number;
  sequence: number;
  pending: PendingState | null;
  tests: StoredTestRecord[];
  needsGreen: NeedsGreen | null;
  observedRed: Record<string, string>;
  lastRed?: LastRed;
};

function emptyState(): GuardState {
  return { version: VERSION, sequence: 0, pending: null, tests: [], needsGreen: null, observedRed: {} };
}

export function digest(value: string): string { return digestKey(value); }

function ensureStateDir(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  ensurePluginWorkdirGitignore(dirname(directory));
}

function statePath(sessionId: string, root: string): string {
  const session = sessionId || "default";
  return join(resolve(root), STATE_DIR_RELATIVE, `${digest(session)}.json`);
}

export function readState(sessionId: string, root: string): GuardState {
  const path = statePath(sessionId, root);
  if (!path) return emptyState();
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(value) || value.version !== VERSION) throw new Error("version mismatch");
    return { observedRed: {}, ...value } as GuardState;
  } catch {
    return emptyState();
  }
}

export function writeState(sessionId: string, root: string, state: GuardState): boolean {
  const path = statePath(sessionId, root);
  if (!path) return false;
  ensureStateDir(dirname(path));
  return withPathLock(path, () => atomicWriteJson(path, { ...state, version: VERSION }));
}
