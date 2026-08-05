/**
 * Create / update run.json and stage templates.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  ensurePcfLayout,
  runDir,
  runJsonPath,
  stagesDir,
  templatesDir,
} from "./paths.mjs";
import { listAllRuns, readRunJson } from "./scan.mjs";
import { refreshActive } from "./active.mjs";

export function writeRun(workspaceRoot, run) {
  const dir = runDir(workspaceRoot, run.runId);
  mkdirSync(dir, { recursive: true });
  const path = runJsonPath(workspaceRoot, run.runId);
  writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  return path;
}

export function generateRunId(workspaceRoot, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const day = `${y}${m}${d}`;
  const existing = listAllRuns(workspaceRoot)
    .map((r) => r.runId)
    .filter((id) => id.startsWith(`run-${day}-`));
  let seq = existing.length + 1;
  let candidate = `run-${day}-${String(seq).padStart(3, "0")}`;
  while (existsSync(runDir(workspaceRoot, candidate))) {
    seq += 1;
    candidate = `run-${day}-${String(seq).padStart(3, "0")}`;
  }
  return candidate;
}

/**
 * Create a deliver run on disk. Caller must have validated sessionId.
 */
export function createDeliverRun(workspaceRoot, {
  sessionId,
  title,
  agent = "claude",
  mode = "on",
  type = "deliver",
}) {
  ensurePcfLayout(workspaceRoot);
  const runId = generateRunId(workspaceRoot);
  const now = new Date().toISOString();
  const run = {
    runId,
    sessionId,
    agent,
    type: type || "deliver",
    title: title || runId,
    status: "open",
    stage: "intent",
    mode: mode === "off" ? "off" : "on",
    required: true,
    blockers: [
      "missing-intent-anchors",
      "missing-plan-anchors",
      "missing-receipt",
    ],
    notes: [],
    createdAt: now,
    updatedAt: now,
  };

  const dir = runDir(workspaceRoot, runId);
  mkdirSync(dir, { recursive: true });
  mkdirSync(stagesDir(workspaceRoot, runId), { recursive: true });
  mkdirSync(join(dir, "receipts"), { recursive: true });

  const tpl = join(templatesDir(), "deliver", "stages");
  if (existsSync(tpl)) {
    cpSync(tpl, stagesDir(workspaceRoot, runId), { recursive: true });
  }

  writeRun(workspaceRoot, run);
  refreshActive(workspaceRoot);
  return run;
}

export function updateRunFields(workspaceRoot, runId, patch) {
  const run = readRunJson(workspaceRoot, runId);
  if (!run) return null;
  const updated = {
    ...run,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeRun(workspaceRoot, updated);
  return updated;
}
