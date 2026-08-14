import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import { extractCwd, extractSessionId } from "./hook-io.mjs";
import { isProfileId } from "./profiles.mjs";

const VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000;
const LOCK_STALE_MS = 30_000;
const LOCK_ATTEMPTS = 100;
const LOCK_WAIT_MS = 10;
const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
export const STATE_DIR_RELATIVE = ".language-output-governance/state";

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function ensureStateDir(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const ignore = join(dirname(directory), ".gitignore");
  if (!existsSync(ignore)) {
    writeFileSync(ignore, "state/\n", { encoding: "utf8", mode: 0o600 });
  }
}

function statePath(event) {
  const session = extractSessionId(event) ?? "default";
  return join(resolve(extractCwd(event)), STATE_DIR_RELATIVE, `${digest(session)}.json`);
}

export function emptyState(defaultProfile = "zh-CN") {
  return {
    version: VERSION,
    preferredProfile: isProfileId(defaultProfile) ? defaultProfile : "zh-CN",
    authorizedProfiles: [],
    toolFeedbackDelivered: false,
    updatedAt: 0,
  };
}

function sanitize(value, defaultProfile) {
  if (!value || typeof value !== "object" || value.version !== VERSION) {
    return emptyState(defaultProfile);
  }
  if (Date.now() - Number(value.updatedAt || 0) > TTL_MS) {
    return emptyState(defaultProfile);
  }
  return {
    version: VERSION,
    preferredProfile: isProfileId(value.preferredProfile)
      ? value.preferredProfile
      : defaultProfile,
    authorizedProfiles: Array.isArray(value.authorizedProfiles)
      ? [...new Set(value.authorizedProfiles.filter(isProfileId))]
      : [],
    toolFeedbackDelivered: value.toolFeedbackDelivered === true,
    updatedAt: Number(value.updatedAt) || 0,
  };
}

function read(path, defaultProfile) {
  if (!path) return emptyState(defaultProfile);
  try {
    return sanitize(JSON.parse(readFileSync(path, "utf8")), defaultProfile);
  } catch {
    return emptyState(defaultProfile);
  }
}

function write(path, state) {
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

function withLock(path, operation) {
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
      if (error?.code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
          rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch (cause) {
        if (cause?.code !== "ENOENT") throw cause;
        continue;
      }
      Atomics.wait(WAIT_BUFFER, 0, 0, LOCK_WAIT_MS);
    }
  }
  throw new Error("timed out waiting for language-output state lock");
}

export function readState(event, defaultProfile = "zh-CN") {
  return read(statePath(event), defaultProfile);
}

export function updateState(event, defaultProfile, updater) {
  const path = statePath(event);
  if (!path) return { state: emptyState(defaultProfile), result: null, persisted: false };
  return withLock(path, () => {
    const state = read(path, defaultProfile);
    const result = updater(state);
    state.updatedAt = Date.now();
    return { state, result, persisted: write(path, state) };
  });
}

export function initializeState(event, defaultProfile, reset = false) {
  return updateState(event, defaultProfile, (state) => {
    if (!reset) return false;
    Object.assign(state, emptyState(defaultProfile));
    return true;
  }).state;
}

export function recordLanguageIntent(event, defaultProfile, intent) {
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

export function claimToolFeedback(event, defaultProfile) {
  return updateState(event, defaultProfile, (state) => {
    if (state.toolFeedbackDelivered) return false;
    state.toolFeedbackDelivered = true;
    return true;
  }).result === true;
}
