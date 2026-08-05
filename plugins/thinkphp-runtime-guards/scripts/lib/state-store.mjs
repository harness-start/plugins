/**
 * Minimal atomic JSON state store for hook cooldowns.
 * Keyed per hook by `sessionId:cwd`; stale entries expire on read.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_ROOT = join(homedir(), ".harness-start", "hook-state");

function stateRoot() {
  return (
    process.env.PLUGIN_DATA ??
    process.env.CLAUDE_PLUGIN_DATA ??
    DEFAULT_ROOT
  );
}

export function stateFilePath(hookId, sessionId, cwd) {
  const key = `${hookId}:${sessionId ?? "no-session"}:${cwd}`;
  const safe = key.replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 200);
  return join(stateRoot(), `${safe}.json`);
}

export function readState(hookId, sessionId, cwd) {
  try {
    const raw = readFileSync(stateFilePath(hookId, sessionId, cwd), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.ts === "number") return parsed;
    return null;
  } catch {
    return null;
  }
}

export function writeState(hookId, sessionId, cwd, ts) {
  const file = stateFilePath(hookId, sessionId, cwd);
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ ts })}\n`, { encoding: "utf-8", mode: 0o600 });
    renameSync(tmp, file);
  } catch {
    // Cooldown persistence is best-effort; injection still proceeds.
  }
}

export function clearState(hookId, sessionId, cwd) {
  try {
    rmSync(stateFilePath(hookId, sessionId, cwd), { force: true });
  } catch {
    // best-effort
  }
}
