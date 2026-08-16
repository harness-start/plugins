import { createHash, randomBytes } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import { isRecord, type HookEvent } from "@harness/core/hook-event";
import { ensurePluginWorkdirGitignore } from "@harness/core/plugin-workdir";

import { extractCwd, extractSessionId } from "./hook-io.js";
import type { LanguageIntent } from "./intent.js";
import { isProfileId, type ProfileId } from "./profiles.js";

export type LanguageState = {
  version: number;
  preferredProfile: ProfileId;
  authorizedProfiles: ProfileId[];
  toolFeedbackDelivered: boolean;
  updatedAt: number;
};

const VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000;
const LOCK_STALE_MS = 30_000;
const LOCK_ATTEMPTS = 100;
const LOCK_WAIT_MS = 10;
const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
export const STATE_DIR_RELATIVE = ".language-output/state";

function digest(value: string): string {
  return createHash("sha256").update(String(value)).digest("hex");
}

function errorCode(error: unknown): unknown {
  return isRecord(error) ? error.code : undefined;
}

function ensureStateDir(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  ensurePluginWorkdirGitignore(dirname(directory));
}

function statePath(event: HookEvent): string {
  const session = extractSessionId(event) ?? "default";
  return join(resolve(extractCwd(event)), STATE_DIR_RELATIVE, `${digest(session)}.json`);
}

export function emptyState(defaultProfile = "zh-CN"): LanguageState {
  return {
    version: VERSION,
    preferredProfile: isProfileId(defaultProfile) ? defaultProfile : "zh-CN",
    authorizedProfiles: [],
    toolFeedbackDelivered: false,
    updatedAt: 0,
  };
}

function sanitize(value: unknown, defaultProfile: string): LanguageState {
  if (!isRecord(value) || value.version !== VERSION) {
    return emptyState(defaultProfile);
  }
  if (Date.now() - Number(value.updatedAt || 0) > TTL_MS) {
    return emptyState(defaultProfile);
  }
  return {
    version: VERSION,
    preferredProfile: isProfileId(value.preferredProfile)
      ? value.preferredProfile
      : isProfileId(defaultProfile) ? defaultProfile : "zh-CN",
    authorizedProfiles: Array.isArray(value.authorizedProfiles)
      ? [...new Set(value.authorizedProfiles.filter(isProfileId))]
      : [],
    toolFeedbackDelivered: value.toolFeedbackDelivered === true,
    updatedAt: Number(value.updatedAt) || 0,
  };
}

function read(path: string, defaultProfile: string): LanguageState {
  if (!path) return emptyState(defaultProfile);
  try {
    return sanitize(JSON.parse(readFileSync(path, "utf8")), defaultProfile);
  } catch {
    return emptyState(defaultProfile);
  }
}

function write(path: string, state: LanguageState): boolean {
  if (!path) return false;
  const directory = dirname(path);
  const temporary = join(directory, `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
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
    rmSync(temporary, { force: true });
    return false;
  }
}

function withLock<T>(path: string, operation: () => T): T {
  if (!path) return operation();
  const lock = `${path}.lock`;
  ensureStateDir(dirname(path));
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      try {
        return operation();
      } finally {
        rmSync(lock, { recursive: true, force: true });
      }
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
          rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch (cause) {
        if (errorCode(cause) !== "ENOENT") throw cause;
        continue;
      }
      Atomics.wait(WAIT_BUFFER, 0, 0, LOCK_WAIT_MS);
    }
  }
  throw new Error("timed out waiting for language-output state lock");
}

export function readState(event: HookEvent, defaultProfile = "zh-CN"): LanguageState {
  return read(statePath(event), defaultProfile);
}

export function updateState<T>(
  event: HookEvent,
  defaultProfile: string,
  updater: (state: LanguageState) => T,
): { state: LanguageState; result: T | null; persisted: boolean } {
  const path = statePath(event);
  if (!path) return { state: emptyState(defaultProfile), result: null, persisted: false };
  return withLock(path, () => {
    const state = read(path, defaultProfile);
    const result = updater(state);
    state.updatedAt = Date.now();
    return { state, result, persisted: write(path, state) };
  });
}

export function initializeState(event: HookEvent, defaultProfile: string, reset = false): LanguageState {
  return updateState(event, defaultProfile, (state) => {
    if (!reset) return false;
    Object.assign(state, emptyState(defaultProfile));
    return true;
  }).state;
}

export function recordLanguageIntent(event: HookEvent, defaultProfile: string, intent: LanguageIntent): LanguageState {
  return updateState(event, defaultProfile, (state) => {
    if (isProfileId(intent.preferredProfile)) {
      state.preferredProfile = intent.preferredProfile;
    }
    state.authorizedProfiles = [
      ...new Set([
        ...state.authorizedProfiles,
        ...intent.authorizedProfiles.filter(isProfileId),
      ]),
    ];
    return true;
  }).state;
}

export function claimToolFeedback(event: HookEvent, defaultProfile: string): boolean {
  return updateState(event, defaultProfile, (state) => {
    if (state.toolFeedbackDelivered) return false;
    state.toolFeedbackDelivered = true;
    return true;
  }).result === true;
}
