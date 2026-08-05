#!/usr/bin/env node
/**
 * SessionStart — inject sessionId + open runs + begin usage.
 * NEVER creates a run.
 */

import {
  readStdinJson,
  extractSessionId,
  extractCwd,
  additionalContextOutput,
  writeJson,
  pcfCliHint,
} from "./lib/hook-io.mjs";
import { resolveWorkspaceRoot } from "./lib/paths.mjs";
import { loadConfig } from "./lib/config.mjs";
import { listOpenRuns } from "./lib/scan.mjs";
import { computeBlockers } from "./lib/stage.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) {
    process.exit(0);
  }

  const sessionId = extractSessionId(event);
  const cwd = extractCwd(event);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const config = loadConfig(workspaceRoot);
  const { cli, beginExample } = pcfCliHint(sessionId);

  const open = sessionId
    ? listOpenRuns(workspaceRoot, { sessionId })
    : [];

  const lines = [
    "[process-confidence] session context",
    "",
    "本插件为交付流程提供可观察门禁。Hooks **不会**根据意图自动创建流程。",
    "",
    sessionId
      ? `sessionId=${sessionId}`
      : "sessionId=(未从事件读到 — 无法调用 begin 直到平台提供会话 id)",
    "",
    "若本轮是交付任务，请先调用工具创建流程：",
    beginExample,
    "",
    `CLI: ${cli}`,
    "其它: status | check | abandon | bypass | mode | timeline",
    "",
  ];

  if (open.length === 0) {
    lines.push("本会话当前无 open 交付流程。");
  } else {
    lines.push(`本会话 open 流程 (${open.length}):`);
    for (const run of open) {
      const blockers = computeBlockers(
        workspaceRoot,
        run,
        config.minSeverity || "pass",
      );
      lines.push(
        `- ${run.title || run.runId} (${run.runId}) stage=${run.stage}` +
          (blockers.length ? ` blockers=${blockers.join(",")}` : ""),
      );
      lines.push(`  path: .process-confidence/runs/${run.runId}/`);
    }
    lines.push("");
    lines.push("Stop 门禁：本会话 required 未收口流程会阻止结束。");
  }

  lines.push("");
  lines.push("硬规则:");
  lines.push("- 禁止伪造/拼接 sessionId");
  lines.push("- 禁止手写 receipts/** 或篡改 run.json 受控字段");
  lines.push("- 人类只看 .process-confidence/ACTIVE.md");

  writeJson(additionalContextOutput("SessionStart", lines.join("\n")));
  process.exit(0);
}

main().catch(() => process.exit(0));
