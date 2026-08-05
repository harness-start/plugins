/**
 * Per-session markers (orphan-work, etc.) under .process-confidence/session-state/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ensurePcfLayout, sessionStateDir, sessionStatePath } from "./paths.mjs";

export function readSessionState(workspaceRoot, sessionId) {
  if (!sessionId) return defaultState(sessionId);
  const path = sessionStatePath(workspaceRoot, sessionId);
  if (!existsSync(path)) return defaultState(sessionId);
  try {
    return { ...defaultState(sessionId), ...JSON.parse(readFileSync(path, "utf8")) };
  } catch {
    return defaultState(sessionId);
  }
}

export function writeSessionState(workspaceRoot, sessionId, state) {
  ensurePcfLayout(workspaceRoot);
  mkdirSync(sessionStateDir(workspaceRoot), { recursive: true });
  const path = sessionStatePath(workspaceRoot, sessionId);
  const payload = {
    ...defaultState(sessionId),
    ...state,
    sessionId,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export function markOrphanWork(workspaceRoot, sessionId, filePath) {
  const state = readSessionState(workspaceRoot, sessionId);
  const files = new Set(state.orphanFiles || []);
  if (filePath) files.add(filePath);
  return writeSessionState(workspaceRoot, sessionId, {
    ...state,
    orphanWork: true,
    orphanFiles: [...files].slice(-50),
  });
}

export function clearOrphanWork(workspaceRoot, sessionId) {
  return writeSessionState(workspaceRoot, sessionId, {
    orphanWork: false,
    orphanFiles: [],
  });
}

function defaultState(sessionId) {
  return {
    sessionId: sessionId || null,
    orphanWork: false,
    orphanFiles: [],
    updatedAt: null,
  };
}
