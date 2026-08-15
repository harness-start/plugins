import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { isRecord, type HookEvent } from "@harness/core/hook-event";
import { ensurePluginWorkdirGitignore } from "@harness/core/plugin-workdir";
import { atomicWriteJson, digestKey, withPathLock } from "@harness/core/state-file";

import { extractCwd, extractSessionId } from "./hook-io.js";

const VERSION = 1;
export const STATE_DIR_RELATIVE = ".execution-loop-guard/state";

export type PollingEntry = {
  at: number;
  sleepSeconds: number;
  queryCount: number;
};

export type CommandRepeatState = {
  commandHash: string;
  inputFingerprint?: string | null;
  failStreak?: number;
  successStreak?: number;
  lastOutcome?: "success" | "failure" | "unknown";
  failureSignature?: string | null;
  lastSeen: number;
};

export type PollingState = {
  entries: PollingEntry[];
  lastReportAt: number;
  lastSeen: number;
};

export type EditState = {
  timestamps: number[];
};

export type LoopState = {
  version: number;
  updatedAt: number;
  edits: Record<string, EditState>;
  command: CommandRepeatState | null;
  polling: PollingState | null;
};

export function digest(value: string): string {
  return digestKey(value);
}

function ensureStateDir(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  ensurePluginWorkdirGitignore(dirname(directory));
}

function statePath(event: HookEvent): string {
  const cwd = resolve(extractCwd(event));
  const session = extractSessionId(event) ?? "default";
  return join(cwd, STATE_DIR_RELATIVE, `${digest(session)}.json`);
}

function emptyState(): LoopState {
  return { version: VERSION, updatedAt: 0, edits: {}, command: null, polling: null };
}

function readState(path: string): LoopState {
  if (!path) return emptyState();
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || !isRecord(parsed) || parsed.version !== VERSION) return emptyState();
    return {
      version: VERSION,
      updatedAt: Number(parsed.updatedAt) || 0,
      edits: isRecord(parsed.edits) ? parsed.edits as LoopState["edits"] : {},
      command: isRecord(parsed.command) ? parsed.command as CommandRepeatState : null,
      polling: isRecord(parsed.polling) ? parsed.polling as PollingState : null,
    };
  } catch {
    return emptyState();
  }
}

function writeState(path: string, state: LoopState): boolean {
  if (!path) return false;
  ensureStateDir(dirname(path));
  return withPathLock(path, () => atomicWriteJson(path, state));
}

export function updateState<T>(event: HookEvent, updater: (state: LoopState) => T): T | null {
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

export function inspectState(event: HookEvent): LoopState | null {
  const path = statePath(event);
  return path ? readState(path) : null;
}
