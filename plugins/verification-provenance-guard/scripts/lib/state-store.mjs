import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { extractCwd, extractSessionId } from "./hook-io.mjs";

const VERSION = 2;
const TTL_MS = 2 * 60 * 60 * 1000;

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function root() {
  return process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA ?? null;
}

function pathFor(event) {
  const data = root();
  const session = extractSessionId(event);
  if (!data || !session) return null;
  const cwd = resolve(extractCwd(event));
  return join(resolve(data), "verification-provenance-guard", `${digest(`${session}\0${cwd}`)}.json`);
}

export function emptyState() {
  return {
    version: VERSION,
    promptEpoch: 0,
    eventSeq: 0,
    revision: 0,
    mutations: [],
    receipts: [],
    stopBlocks: 0,
    abortAuthorized: false,
    updatedAt: 0,
  };
}

function sanitize(value) {
  if (!value || typeof value !== "object" || value.version !== VERSION) return emptyState();
  if (Date.now() - Number(value.updatedAt || 0) > TTL_MS) return emptyState();
  return {
    version: VERSION,
    promptEpoch: Number.isSafeInteger(value.promptEpoch) && value.promptEpoch >= 0 ? value.promptEpoch : 0,
    eventSeq: Number.isSafeInteger(value.eventSeq) && value.eventSeq >= 0 ? value.eventSeq : 0,
    revision: Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0,
    mutations: Array.isArray(value.mutations) ? value.mutations.slice(-100) : [],
    receipts: Array.isArray(value.receipts) ? value.receipts.slice(-100) : [],
    stopBlocks: Number.isSafeInteger(value.stopBlocks) && value.stopBlocks >= 0 ? value.stopBlocks : 0,
    abortAuthorized: value.abortAuthorized === true,
    updatedAt: Number(value.updatedAt) || 0,
  };
}

function read(path) {
  if (!path) return emptyState();
  try { return sanitize(JSON.parse(readFileSync(path, "utf8"))); } catch { return emptyState(); }
}

function write(path, state) {
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

export function readState(event) {
  return read(pathFor(event));
}

export function updateState(event, updater) {
  const path = pathFor(event);
  if (!path) return { state: emptyState(), result: null, persisted: false };
  const state = read(path);
  const result = updater(state);
  state.mutations = state.mutations.slice(-100);
  state.receipts = state.receipts.slice(-100);
  state.updatedAt = Date.now();
  return { state, result, persisted: write(path, state) };
}

export function clearState(event) {
  const path = pathFor(event);
  if (!path) return false;
  try { rmSync(path, { force: true }); return true; } catch { return false; }
}
