import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
function root() { return process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA || null; }
function safe(value) { return String(value || "unknown").replace(/[^a-zA-Z0-9._-]/gu, "_"); }
function file(namespace, event) { const base = root(); if (!base) return null; return join(base, "delivery-evidence", `${safe(namespace)}-${safe(event?.session_id ?? event?.sessionId ?? `cwd-${event?.cwd ?? "unknown"}`)}.json`); }
export function readState(namespace, event, fallback = null) { const path = file(namespace, event); if (!path) return fallback; try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; } }
export function updateState(namespace, event, fallback, updater) { const path = file(namespace, event); if (!path) return fallback; const next = updater(readState(namespace, event, fallback)), staged = `${path}.${process.pid}.tmp`; try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(staged, `${JSON.stringify(next)}\n`, { mode: 0o600 }); renameSync(staged, path); return next; } catch { rmSync(staged, { force: true }); return fallback; } }
