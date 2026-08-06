import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function root() { return process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA || null; }
function safe(value) { return String(value || "unknown").replace(/[^a-zA-Z0-9._-]/gu, "_"); }
function pathFor(namespace, event) { const dir = root(); if (!dir) return null; const session = event?.session_id ?? event?.sessionId ?? `cwd-${event?.cwd ?? "unknown"}`; return join(dir, "execution-discipline", `${safe(namespace)}-${safe(session)}.json`); }
export function readState(namespace, event, fallback = null) { const path = pathFor(namespace, event); if (!path) return fallback; try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; } }
export function writeState(namespace, event, value) { const path = pathFor(namespace, event); if (!path) return false; const staged = `${path}.${process.pid}.tmp`; try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(staged, `${JSON.stringify(value)}\n`, { mode: 0o600 }); renameSync(staged, path); return true; } catch { rmSync(staged, { force: true }); return false; } }
export function updateState(namespace, event, fallback, updater) { const current = readState(namespace, event, fallback); const next = updater(current); writeState(namespace, event, next); return next; }
