/**
 * Scan runs/<runId>/run.json (no index.json).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runsDir, runJsonPath } from "./paths.mjs";

export function readRunJson(workspaceRoot, runId) {
  const path = runJsonPath(workspaceRoot, runId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function listAllRuns(workspaceRoot) {
  const dir = runsDir(workspaceRoot);
  if (!existsSync(dir)) return [];
  const ids = readdirSync(dir).filter((name) => {
    return existsSync(runJsonPath(workspaceRoot, name));
  });
  const runs = [];
  for (const runId of ids) {
    const run = readRunJson(workspaceRoot, runId);
    if (run) runs.push(run);
  }
  runs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return runs;
}

export function listOpenRuns(workspaceRoot, { sessionId } = {}) {
  return listAllRuns(workspaceRoot).filter((run) => {
    if (run.status !== "open") return false;
    if (sessionId && run.sessionId !== sessionId) return false;
    return true;
  });
}

export function listRequiredOpenRunsForStop(workspaceRoot, sessionId) {
  return listOpenRuns(workspaceRoot, { sessionId }).filter((run) => {
    return (
      run.mode === "on" &&
      run.required === true &&
      run.bypass !== true &&
      run.sessionId === sessionId
    );
  });
}

export function findRun(workspaceRoot, runId) {
  return readRunJson(workspaceRoot, runId);
}

export function listReceipts(workspaceRoot, runId) {
  const dir = join(runsDir(workspaceRoot), runId, "receipts");
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const receipts = [];
  for (const f of files) {
    try {
      const r = JSON.parse(readFileSync(join(dir, f), "utf8"));
      receipts.push(r);
    } catch {
      /* skip */
    }
  }
  receipts.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return receipts;
}
