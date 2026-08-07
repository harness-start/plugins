import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { extractCwd, extractSessionId } from "./hook-io.mjs";

const VERSION = 1;
const PLUGIN_DIR = "intent-clarify-gate";

export function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function dataRoot() {
  return process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA ?? null;
}

export function emptyState() {
  return {
    version: VERSION,
    phase: "idle",
    enteredAt: 0,
    updatedAt: 0,
    entryToken: null,
    topicPreview: null,
    turnIndex: 0,
    lastUserClass: null,
    lastChoice: null,
    lastNote: null,
    completeOffered: false,
    completeChoice: null,
    closeReason: null,
    skillReady: false,
  };
}

export function statePath(event) {
  const root = dataRoot();
  if (!root) return null;
  const cwd = resolve(extractCwd(event));
  const session = extractSessionId(event) ?? `cwd:${cwd}`;
  return join(resolve(root), PLUGIN_DIR, `${digest(`${session}\0${cwd}`)}.json`);
}

function readStateFile(path) {
  if (!path) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || parsed.version !== VERSION) {
      return emptyState();
    }
    const base = emptyState();
    return {
      ...base,
      ...parsed,
      version: VERSION,
      phase: ["idle", "open", "closed"].includes(parsed.phase) ? parsed.phase : "idle",
      completeOffered: Boolean(parsed.completeOffered),
      completeChoice: parsed.completeChoice == null ? null : String(parsed.completeChoice),
      turnIndex: Number(parsed.turnIndex) || 0,
      enteredAt: Number(parsed.enteredAt) || 0,
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    // Corrupt or unreadable → fail-open idle
    return emptyState();
  }
}

function writeStateFile(path, state) {
  if (!path) return false;
  const directory = dirname(path);
  const temporary = join(
    directory,
    `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`,
  );
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(temporary, `${JSON.stringify(state)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, path);
    return true;
  } catch {
    try {
      rmSync(temporary, { force: true });
    } catch {
      // ignore
    }
    return false;
  }
}

export function readState(event) {
  return readStateFile(statePath(event));
}

export function updateState(event, updater) {
  const path = statePath(event);
  if (!path) {
    // No data dir → fail-open: operate on ephemeral state only
    const ephemeral = emptyState();
    return updater(ephemeral);
  }
  try {
    const state = readStateFile(path);
    const result = updater(state);
    state.updatedAt = Date.now();
    if (!writeStateFile(path, state)) {
      // Write failure: still return result of in-memory transition for this turn,
      // but next turn may miss it (fail-open for lock: next read idle).
      return result;
    }
    return result;
  } catch {
    return updater(emptyState());
  }
}

export function inspectState(event) {
  const path = statePath(event);
  return path ? readStateFile(path) : emptyState();
}

/** Test helper: force data root + path resolution */
export function __testStatePath(event) {
  return statePath(event);
}
