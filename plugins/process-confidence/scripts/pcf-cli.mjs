#!/usr/bin/env node
/**
 * pcf — Process Confidence CLI (LLM tool surface).
 *
 * begin is the only run-creation path; sessionId is required + registry-validated.
 * Hooks never call begin.
 */

import { resolveWorkspaceRoot, pluginRoot } from "./lib/paths.mjs";
import { loadConfig } from "./lib/config.mjs";
import { validateSessionId } from "./lib/session-registry.mjs";
import {
  findRun,
  listAllRuns,
  listOpenRuns,
  listReceipts,
} from "./lib/scan.mjs";
import { createDeliverRun, updateRunFields, writeRun } from "./lib/run-io.mjs";
import { assertOwnsRun } from "./lib/ownership.mjs";
import { gateRun, formatBeginRejected } from "./lib/gate.mjs";
import { computeBlockers, maybeAdvanceStage } from "./lib/stage.mjs";
import { refreshActive } from "./lib/active.mjs";
import { tryCompleteRun } from "./lib/complete.mjs";
import {
  buildReceipt,
  writeReceipt,
  isVerifyCommand,
} from "./lib/receipt.mjs";

function usage() {
  return `pcf — Process Confidence

Usage:
  pcf begin   --session-id <id> --title <str> [--type deliver] [--mode on|off] [--cwd <path>]
  pcf status  --session-id <id> [--run <runId>] [--cwd <path>]
  pcf check   --session-id <id> [--run <runId>] [--cwd <path>]
  pcf abandon --session-id <id> --run <runId> --reason <str> [--cwd <path>]
  pcf bypass  --session-id <id> --run <runId> --reason <str> [--cwd <path>]
  pcf mode    --session-id <id> --run <runId> --on|--off [--cwd <path>]
  pcf timeline --session-id <id> [--run <runId>] [--cwd <path>]
  pcf complete --session-id <id> --run <runId> [--cwd <path>]   # degrade path
  pcf receipt  --session-id <id> --run <runId> --command <cmd> --exit-code <n>  # degrade

Plugin root: ${pluginRoot()}
`;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--session-id" || a === "--sessionId") {
      args.sessionId = argv[++i];
    } else if (a === "--title") {
      args.title = argv[++i];
    } else if (a === "--type") {
      args.type = argv[++i];
    } else if (a === "--mode") {
      args.mode = argv[++i];
    } else if (a === "--run") {
      args.run = argv[++i];
    } else if (a === "--reason") {
      args.reason = argv[++i];
    } else if (a === "--cwd") {
      args.cwd = argv[++i];
    } else if (a === "--on") {
      args.modeFlag = "on";
    } else if (a === "--off") {
      args.modeFlag = "off";
    } else if (a === "--command") {
      args.command = argv[++i];
    } else if (a === "--exit-code") {
      args.exitCode = Number(argv[++i]);
    } else if (a === "--help" || a === "-h") {
      args.help = true;
    } else if (a.startsWith("-")) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      args._.push(a);
    }
  }
  return args;
}

function requireSessionId(args) {
  if (!args.sessionId) {
    fail("missing-session-id", "pcf requires --session-id <id>");
  }
  return args.sessionId;
}

function validateSessionOrFail(sessionId, config) {
  const result = validateSessionId(sessionId, { config });
  if (!result.ok) {
    if (result.reason === "session-not-found-in-registry") {
      process.stderr.write(`${formatBeginRejected(sessionId)}\n`);
      process.exit(3);
    }
    fail(result.reason || "invalid-session-id", `sessionId rejected: ${result.reason}`);
  }
  return result;
}

function fail(code, message) {
  process.stderr.write(`[process-confidence] ${code}: ${message}\n`);
  process.exit(2);
}

function ok(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function loadWorkspace(args) {
  const cwd = args.cwd || process.cwd();
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const config = loadConfig(workspaceRoot);
  return { workspaceRoot, config };
}

function cmdBegin(args) {
  const sessionId = requireSessionId(args);
  if (!args.title) fail("missing-title", "begin requires --title");
  const { workspaceRoot, config } = loadWorkspace(args);
  const v = validateSessionOrFail(sessionId, config);
  const run = createDeliverRun(workspaceRoot, {
    sessionId,
    title: args.title,
    agent: v.agent,
    mode: args.mode || config.mode || "on",
    type: args.type || "deliver",
  });
  ok({
    ok: true,
    action: "begin",
    runId: run.runId,
    sessionId: run.sessionId,
    agent: run.agent,
    stage: run.stage,
    paths: {
      run: `.process-confidence/runs/${run.runId}/run.json`,
      intent: `.process-confidence/runs/${run.runId}/stages/01-intent.md`,
      plan: `.process-confidence/runs/${run.runId}/stages/02-plan.md`,
      active: ".process-confidence/ACTIVE.md",
    },
    next: [
      "填写 stages/01-intent.md（## 非目标 + ## 成功标准）",
      "填写 stages/02-plan.md（## 涉及文件 + ## 验证 + ## 回滚）",
      "实施业务改动并运行验证命令；hook 会写 receipt 并在门禁通过后自动 complete",
    ],
  });
}

function cmdStatus(args) {
  const sessionId = requireSessionId(args);
  const { workspaceRoot, config } = loadWorkspace(args);
  validateSessionOrFail(sessionId, config);

  if (args.run) {
    const run = findRun(workspaceRoot, args.run);
    if (!run) fail("run-not-found", args.run);
    const own = assertOwnsRun(run, sessionId);
    if (!own.ok) fail(own.reason, args.run);
    const blockers = computeBlockers(workspaceRoot, run, config.minSeverity);
    ok({ ok: true, run, blockers, receipts: listReceipts(workspaceRoot, run.runId) });
    return;
  }

  const open = listOpenRuns(workspaceRoot, { sessionId });
  ok({
    ok: true,
    sessionId,
    openRuns: open.map((r) => ({
      runId: r.runId,
      title: r.title,
      stage: r.stage,
      status: r.status,
      blockers: computeBlockers(workspaceRoot, r, config.minSeverity),
    })),
  });
}

function cmdCheck(args) {
  const sessionId = requireSessionId(args);
  const { workspaceRoot, config } = loadWorkspace(args);
  validateSessionOrFail(sessionId, config);

  const runs = args.run
    ? [findRun(workspaceRoot, args.run)].filter(Boolean)
    : listOpenRuns(workspaceRoot, { sessionId });

  const results = runs.map((run) => {
    const own = assertOwnsRun(run, sessionId);
    if (!own.ok) return { runId: run.runId, error: own.reason };
    const gate = gateRun(workspaceRoot, run, config.minSeverity);
    return {
      runId: run.runId,
      title: run.title,
      stage: run.stage,
      gateOk: gate.ok,
      blockers: gate.blockers,
    };
  });
  ok({ ok: true, results });
}

function cmdAbandon(args) {
  const sessionId = requireSessionId(args);
  if (!args.run) fail("missing-run", "abandon requires --run");
  if (!args.reason) fail("missing-reason", "abandon requires --reason");
  const { workspaceRoot, config } = loadWorkspace(args);
  validateSessionOrFail(sessionId, config);
  const run = findRun(workspaceRoot, args.run);
  if (!run) fail("run-not-found", args.run);
  const own = assertOwnsRun(run, sessionId);
  if (!own.ok) fail(own.reason, args.run);

  const updated = {
    ...run,
    status: "abandoned",
    abandonReason: args.reason,
    abandonedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    required: false,
  };
  writeRun(workspaceRoot, updated);
  refreshActive(workspaceRoot, config);
  ok({ ok: true, action: "abandon", runId: updated.runId });
}

function cmdBypass(args) {
  const sessionId = requireSessionId(args);
  if (!args.run) fail("missing-run", "bypass requires --run");
  if (!args.reason) fail("missing-reason", "bypass requires --reason");
  const { workspaceRoot, config } = loadWorkspace(args);
  validateSessionOrFail(sessionId, config);
  const run = findRun(workspaceRoot, args.run);
  if (!run) fail("run-not-found", args.run);
  const own = assertOwnsRun(run, sessionId);
  if (!own.ok) fail(own.reason, args.run);

  const updated = updateRunFields(workspaceRoot, run.runId, {
    bypass: true,
    bypassReason: args.reason,
    required: false,
  });
  refreshActive(workspaceRoot, config);
  ok({ ok: true, action: "bypass", runId: updated.runId });
}

function cmdMode(args) {
  const sessionId = requireSessionId(args);
  if (!args.run) fail("missing-run", "mode requires --run");
  const mode = args.modeFlag || args.mode;
  if (mode !== "on" && mode !== "off") {
    fail("missing-mode", "mode requires --on or --off");
  }
  const { workspaceRoot, config } = loadWorkspace(args);
  validateSessionOrFail(sessionId, config);
  const run = findRun(workspaceRoot, args.run);
  if (!run) fail("run-not-found", args.run);
  const own = assertOwnsRun(run, sessionId);
  if (!own.ok) fail(own.reason, args.run);

  const updated = updateRunFields(workspaceRoot, run.runId, { mode });
  refreshActive(workspaceRoot, config);
  ok({ ok: true, action: "mode", runId: updated.runId, mode });
}

function cmdTimeline(args) {
  const sessionId = requireSessionId(args);
  const { workspaceRoot, config } = loadWorkspace(args);
  validateSessionOrFail(sessionId, config);

  const runs = args.run
    ? [findRun(workspaceRoot, args.run)].filter(Boolean)
    : listAllRuns(workspaceRoot).filter((r) => r.sessionId === sessionId);

  const timeline = runs.map((run) => ({
    runId: run.runId,
    title: run.title,
    status: run.status,
    stage: run.stage,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
    receipts: listReceipts(workspaceRoot, run.runId).map((r) => ({
      id: r.id,
      at: r.at,
      outcome: r.outcome,
      command: r.command,
    })),
  }));
  ok({ ok: true, timeline });
}

function cmdComplete(args) {
  const sessionId = requireSessionId(args);
  if (!args.run) fail("missing-run", "complete requires --run");
  const { workspaceRoot, config } = loadWorkspace(args);
  validateSessionOrFail(sessionId, config);
  const run = findRun(workspaceRoot, args.run);
  if (!run) fail("run-not-found", args.run);
  const own = assertOwnsRun(run, sessionId);
  if (!own.ok) fail(own.reason, args.run);
  const result = tryCompleteRun(workspaceRoot, run, config);
  if (!result.completed) {
    fail(result.reason || "complete-failed", JSON.stringify(result.blockers || []));
  }
  ok({ ok: true, action: "complete", ...result });
}

function cmdReceipt(args) {
  // Degrade path when platform lacks PostToolUse
  const sessionId = requireSessionId(args);
  if (!args.run) fail("missing-run", "receipt requires --run");
  if (!args.command) fail("missing-command", "receipt requires --command");
  if (typeof args.exitCode !== "number" || Number.isNaN(args.exitCode)) {
    fail("missing-exit-code", "receipt requires --exit-code <n>");
  }
  const { workspaceRoot, config } = loadWorkspace(args);
  validateSessionOrFail(sessionId, config);
  const run = findRun(workspaceRoot, args.run);
  if (!run) fail("run-not-found", args.run);
  const own = assertOwnsRun(run, sessionId);
  if (!own.ok) fail(own.reason, args.run);

  if (!isVerifyCommand(args.command, config) && args.exitCode === 0) {
    // still allow explicit tool-signed receipts
  }

  const receipt = buildReceipt({
    runId: run.runId,
    sessionId,
    command: args.command,
    exitCode: args.exitCode,
    issuer: "pcf-tool",
  });
  const path = writeReceipt(workspaceRoot, receipt);

  let current = run;
  const adv = maybeAdvanceStage(workspaceRoot, current, config.minSeverity);
  if (adv.changed) {
    writeRun(workspaceRoot, adv.run);
    current = adv.run;
  }
  current = {
    ...current,
    blockers: computeBlockers(workspaceRoot, current, config.minSeverity),
    updatedAt: new Date().toISOString(),
  };
  writeRun(workspaceRoot, current);
  refreshActive(workspaceRoot, config);

  const completed = tryCompleteRun(workspaceRoot, current, config);
  ok({ ok: true, action: "receipt", receipt, path, completed });
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    fail("bad-args", err.message);
  }

  const cmd = args._[0];
  if (!cmd || args.help) {
    process.stdout.write(usage());
    process.exit(cmd ? 0 : 1);
  }

  const map = {
    begin: cmdBegin,
    status: cmdStatus,
    check: cmdCheck,
    abandon: cmdAbandon,
    bypass: cmdBypass,
    mode: cmdMode,
    timeline: cmdTimeline,
    complete: cmdComplete,
    receipt: cmdReceipt,
  };

  const fn = map[cmd];
  if (!fn) {
    process.stderr.write(usage());
    fail("unknown-command", cmd);
  }
  fn(args);
}

main();
