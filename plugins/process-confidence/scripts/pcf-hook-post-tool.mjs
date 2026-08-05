#!/usr/bin/env node
/**
 * PostToolUse — receipts, stage advance, auto-complete, orphan mark.
 * NEVER creates a run (begin).
 */

import {
  readStdinJson,
  extractSessionId,
  extractCwd,
  extractToolName,
  extractToolInput,
  extractFilePath,
} from "./lib/hook-io.mjs";
import { resolveWorkspaceRoot } from "./lib/paths.mjs";
import { loadConfig } from "./lib/config.mjs";
import { listOpenRuns } from "./lib/scan.mjs";
import { writeRun } from "./lib/run-io.mjs";
import {
  maybeAdvanceStage,
  computeBlockers,
  planReady,
  readStageFile,
} from "./lib/stage.mjs";
import {
  buildReceipt,
  writeReceipt,
  isVerifyCommand,
  extractShellCommand,
  extractExitCode,
} from "./lib/receipt.mjs";
import { tryCompleteRun } from "./lib/complete.mjs";
import { refreshActive } from "./lib/active.mjs";
import {
  isBusinessPath,
  isStagePath,
  runIdFromPath,
} from "./lib/ownership.mjs";
import { markOrphanWork, clearOrphanWork } from "./lib/session-state.mjs";

const WRITE_TOOLS =
  /^(Edit|Write|MultiEdit|ApplyPatch|NotebookEdit|create_file|search_replace)$/i;

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  const sessionId = extractSessionId(event);
  if (!sessionId) process.exit(0);

  const cwd = extractCwd(event);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const config = loadConfig(workspaceRoot);
  const toolName = extractToolName(event);
  const toolInput = extractToolInput(event);

  // ── Shell / verify command → receipt ──
  const command = extractShellCommand(toolName, toolInput);
  if (command && isVerifyCommand(command, config)) {
    const exitCode = extractExitCode(event);
    if (exitCode === 0) {
      const open = listOpenRuns(workspaceRoot, { sessionId });
      // Attach receipt to most recently updated open run, or all open required
      const targets =
        open.length === 1
          ? open
          : open.filter((r) => r.stage === "implement" || r.stage === "verify");
      const runList = targets.length ? targets : open.slice(-1);

      for (const run of runList) {
        if (run.sessionId !== sessionId) continue;
        const receipt = buildReceipt({
          runId: run.runId,
          sessionId,
          command,
          exitCode: 0,
          summary: `verify via ${toolName}`,
          issuer: "pcf-hook",
        });
        writeReceipt(workspaceRoot, receipt);

        let current = run;
        const adv = maybeAdvanceStage(
          workspaceRoot,
          current,
          config.minSeverity,
        );
        if (adv.changed) current = adv.run;
        current = {
          ...current,
          blockers: computeBlockers(
            workspaceRoot,
            current,
            config.minSeverity,
          ),
          updatedAt: new Date().toISOString(),
        };
        writeRun(workspaceRoot, current);
        tryCompleteRun(workspaceRoot, current, config);
      }
      refreshActive(workspaceRoot, config);
    }
    process.exit(0);
  }

  // ── Write/Edit side effects ──
  if (!WRITE_TOOLS.test(toolName) && !/write|edit|patch/i.test(toolName)) {
    process.exit(0);
  }

  const filePath = extractFilePath(toolInput);
  if (!filePath) process.exit(0);

  // Stage file updated → maybe advance stage
  if (isStagePath(filePath)) {
    const runId = runIdFromPath(filePath);
    const open = listOpenRuns(workspaceRoot, { sessionId });
    const run = open.find((r) => r.runId === runId);
    if (run) {
      let current = run;
      const adv = maybeAdvanceStage(
        workspaceRoot,
        current,
        config.minSeverity,
      );
      if (adv.changed) current = adv.run;
      current = {
        ...current,
        blockers: computeBlockers(workspaceRoot, current, config.minSeverity),
        updatedAt: new Date().toISOString(),
      };
      writeRun(workspaceRoot, current);
      tryCompleteRun(workspaceRoot, current, config);
      refreshActive(workspaceRoot, config);
    }
    process.exit(0);
  }

  // Business write without open run → orphan mark
  if (isBusinessPath(filePath)) {
    const open = listOpenRuns(workspaceRoot, { sessionId });
    if (open.length === 0) {
      markOrphanWork(workspaceRoot, sessionId, filePath);
    } else {
      clearOrphanWork(workspaceRoot, sessionId);
      // plan drift note: file not listed in 涉及文件
      for (const run of open) {
        if (!planReady(workspaceRoot, run.runId)) continue;
        const plan = readStageFile(workspaceRoot, run.runId, "02-plan.md") || "";
        const base = filePath.split(/[/\\]/).pop();
        if (base && !plan.includes(base) && !plan.includes(filePath)) {
          const note = `plan-drift: touched ${base}`;
          const notes = Array.isArray(run.notes) ? run.notes : [];
          if (!notes.includes(note)) {
            writeRun(workspaceRoot, {
              ...run,
              notes: [...notes, note].slice(-20),
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }
      refreshActive(workspaceRoot, config);
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
