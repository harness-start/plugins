#!/usr/bin/env node
/**
 * Stop — auto-complete ready runs, then gateSessionStop.
 * NEVER creates a run.
 */

import {
  readStdinJson,
  extractSessionId,
  extractCwd,
  stopBlock,
  writeJson,
  pcfCliHint,
} from "./lib/hook-io.mjs";
import { resolveWorkspaceRoot } from "./lib/paths.mjs";
import { loadConfig } from "./lib/config.mjs";
import {
  gateSessionStop,
  formatStopBlockMessage,
} from "./lib/gate.mjs";
import { tryCompleteReadyRuns } from "./lib/complete.mjs";
import { readSessionState } from "./lib/session-state.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  // Avoid infinite stop loops if platform sets this
  if (event.stop_hook_active || event.stopHookActive) {
    process.exit(0);
  }

  const sessionId = extractSessionId(event);
  if (!sessionId) {
    // Without session id we cannot scope the gate; fail-open
    process.exit(0);
  }

  const cwd = extractCwd(event);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const config = loadConfig(workspaceRoot);

  // First: auto-complete any ready runs for this session
  tryCompleteReadyRuns(workspaceRoot, sessionId, config);

  const state = readSessionState(workspaceRoot, sessionId);
  const gate = gateSessionStop(workspaceRoot, sessionId, {
    orphanWork: Boolean(state.orphanWork),
    orphanWorkStop: config.orphanWorkStop,
    minSeverity: config.minSeverity,
  });

  if (gate.allow) {
    process.exit(0);
  }

  let reason = formatStopBlockMessage(gate, sessionId);
  if (gate.reason === "orphan-work") {
    const { beginExample } = pcfCliHint(sessionId);
    reason = [
      reason,
      "",
      `begin example: ${beginExample}`,
    ].join("\n");
  }

  writeJson(stopBlock(reason));
  // Also emit stderr for hosts that only read exit codes
  process.stderr.write(`${reason}\n`);
  process.exit(0);
}

main().catch(() => process.exit(0));
