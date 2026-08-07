import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { extractSessionId } from "./hook-io.mjs";

const VERSION = 2;
const TTL_MS = 24 * 60 * 60 * 1000;
const LOCK_STALE_MS = 30_000;
const LOCK_ATTEMPTS = 100;
const LOCK_WAIT_MS = 10;
const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function dataRoot() {
  return process.env.PLUGIN_DATA
    ?? process.env.CLAUDE_PLUGIN_DATA
    ?? process.env.PROJECT_INSTRUCTION_GUARD_DATA
    ?? join(tmpdir(), "harness-start-plugin-data");
}

function pathFor(event, root) {
  const session = extractSessionId(event) ?? "anonymous";
  return join(resolve(dataRoot()), "project-instruction-guard", `${digest(`${session}\0${resolve(root)}`)}.json`);
}

export function emptyState() {
  return {
    version: VERSION,
    mutationRevision: 0,
    verifiedRevision: -1,
    verifiedStateDigest: null,
    verifiedAt: null,
    guardMutationInvocationId: null,
    guardMutationRevisionId: null,
    reminderPending: false,
    stopBlocks: 0,
    updatedAt: 0,
  };
}

function conservativeDirtyState() {
  return {
    ...emptyState(),
    mutationRevision: 1,
    reminderPending: true,
  };
}

function sanitize(value) {
  if (!value || typeof value !== "object" || value.version !== VERSION) return conservativeDirtyState();
  if (Date.now() - Number(value.updatedAt || 0) > TTL_MS) return conservativeDirtyState();
  return {
    version: VERSION,
    mutationRevision: Number.isSafeInteger(value.mutationRevision) && value.mutationRevision >= 0 ? value.mutationRevision : 0,
    verifiedRevision: Number.isSafeInteger(value.verifiedRevision) ? value.verifiedRevision : -1,
    verifiedStateDigest: typeof value.verifiedStateDigest === "string" ? value.verifiedStateDigest : null,
    verifiedAt: typeof value.verifiedAt === "string" ? value.verifiedAt : null,
    guardMutationInvocationId: typeof value.guardMutationInvocationId === "string" ? value.guardMutationInvocationId : null,
    guardMutationRevisionId: typeof value.guardMutationRevisionId === "string" ? value.guardMutationRevisionId : null,
    reminderPending: value.reminderPending === true,
    stopBlocks: Number.isSafeInteger(value.stopBlocks) && value.stopBlocks >= 0 ? value.stopBlocks : 0,
    updatedAt: Number(value.updatedAt) || 0,
  };
}

function read(path) {
  try {
    return sanitize(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    return error?.code === "ENOENT" ? emptyState() : conservativeDirtyState();
  }
}

function write(path, state) {
  const directory = dirname(path);
  const temporary = join(directory, `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function withLock(path, operation) {
  const lock = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
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
  throw new Error("timed out waiting for the project instruction state lock");
}

export function readState(event, root) {
  return read(pathFor(event, root));
}

export function updateState(event, root, updater) {
  const path = pathFor(event, root);
  return withLock(path, () => {
    const state = read(path);
    const result = updater(state);
    state.updatedAt = Date.now();
    write(path, state);
    return { state, result };
  });
}

export function clearState(event, root) {
  const path = pathFor(event, root);
  withLock(path, () => rmSync(path, { force: true }));
}
