/**
 * Auto-complete open runs when gateRun passes: export + archive + status done.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  cpSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import {
  archiveDir,
  evidenceDir,
  runDir,
  runJsonPath,
  stagesDir,
} from "./paths.mjs";
import { gateRun } from "./gate.mjs";
import { listReceipts, listOpenRuns } from "./scan.mjs";
import { refreshActive } from "./active.mjs";
import { writeRun } from "./run-io.mjs";

export function tryCompleteRun(workspaceRoot, run, config = {}) {
  if (!run || run.status !== "open") {
    return { completed: false, reason: "not-open" };
  }
  if (run.mode === "off") {
    return { completed: false, reason: "mode-off" };
  }

  const minSeverity = config.minSeverity || "pass";
  const gate = gateRun(workspaceRoot, run, minSeverity);
  if (!gate.ok) {
    return { completed: false, reason: "gate-failed", blockers: gate.blockers };
  }

  const now = new Date().toISOString();
  const updated = {
    ...run,
    status: "done",
    stage: "done",
    blockers: [],
    completedAt: now,
    updatedAt: now,
  };

  // Export evidence before archive
  const evidencePath = exportEvidence(workspaceRoot, updated, config);
  writeRun(workspaceRoot, updated);

  // Move to archive
  const src = runDir(workspaceRoot, run.runId);
  const dest = join(archiveDir(workspaceRoot), run.runId);
  mkdirSync(archiveDir(workspaceRoot), { recursive: true });
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  try {
    renameSync(src, dest);
  } catch {
    // cross-device fallback
    cpSync(src, dest, { recursive: true });
    rmSync(src, { recursive: true, force: true });
  }

  refreshActive(workspaceRoot, config);
  return {
    completed: true,
    runId: run.runId,
    evidencePath,
    archivedTo: dest,
  };
}

export function tryCompleteReadyRuns(workspaceRoot, sessionId, config = {}) {
  const open = listOpenRuns(workspaceRoot, { sessionId });
  const results = [];
  for (const run of open) {
    const r = tryCompleteRun(workspaceRoot, run, config);
    if (r.completed) results.push(r);
  }
  return results;
}

function exportEvidence(workspaceRoot, run, config) {
  const dir = evidenceDir(workspaceRoot);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${run.runId}.md`);

  const intent = safeRead(join(stagesDir(workspaceRoot, run.runId), "01-intent.md"));
  const plan = safeRead(join(stagesDir(workspaceRoot, run.runId), "02-plan.md"));
  // After writeRun but before move — receipts still in place
  const receipts = listReceipts(workspaceRoot, run.runId);

  const lines = [
    `# Process Evidence: ${run.title || run.runId}`,
    "",
    `- runId: \`${run.runId}\``,
    `- type: ${run.type}`,
    `- completedAt: ${run.completedAt}`,
    "",
    "## Intent",
    "",
    intent || "_(missing)_",
    "",
    "## Plan",
    "",
    plan || "_(missing)_",
    "",
    "## Receipts",
    "",
  ];

  if (receipts.length === 0) {
    lines.push("_(none)_");
  } else {
    for (const r of receipts) {
      lines.push(
        `- \`${r.id}\` outcome=${r.outcome} exit=${r.exitCode} cmd=\`${String(r.command).slice(0, 120)}\``,
      );
    }
  }

  lines.push("");
  if (config.showSessionIdInActive) {
    lines.push(`sessionId: \`${run.sessionId}\``);
    lines.push("");
  }

  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
  return path;
}

function safeRead(path) {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

// re-export path helper used above
void runJsonPath;
