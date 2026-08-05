/**
 * ACTIVE.md generation — human entry; default hide sessionId.
 */

import { writeFileSync } from "node:fs";
import { activePath, ensurePcfLayout } from "./paths.mjs";
import { listOpenRuns } from "./scan.mjs";
import { computeBlockers } from "./stage.mjs";
import { loadConfig } from "./config.mjs";

export function renderActiveMarkdown(workspaceRoot, config) {
  const cfg = config ?? loadConfig(workspaceRoot);
  const open = listOpenRuns(workspaceRoot);
  const max = cfg.activeMaxRunsListed ?? 20;
  const listed = open.slice(0, max);

  const lines = [
    "# Process Confidence — ACTIVE",
    "",
    `更新时间: ${new Date().toISOString()}`,
    "",
  ];

  if (listed.length === 0) {
    lines.push("当前没有进行中的交付流程。");
    lines.push("");
    lines.push("Agent 若开始交付任务，应调用：");
    lines.push("```");
    lines.push('pcf begin --session-id <hook注入的会话ID> --title "<短标题>"');
    lines.push("```");
    lines.push("");
    return lines.join("\n");
  }

  lines.push(`进行中流程: **${open.length}** 条`);
  lines.push("");

  for (const run of listed) {
    const blockers = computeBlockers(
      workspaceRoot,
      run,
      cfg.minSeverity || "pass",
    );
    lines.push(`## ${run.title || run.runId}`);
    lines.push("");
    lines.push(`- runId: \`${run.runId}\``);
    lines.push(`- 阶段: **${run.stage}**`);
    lines.push(`- 状态: ${run.status}`);
    lines.push(`- 模式: ${run.mode}${run.required ? " · required" : ""}`);
    if (cfg.showSessionIdInActive) {
      lines.push(`- sessionId: \`${run.sessionId}\``);
    }
    if (blockers.length) {
      lines.push(`- 阻塞: ${blockers.map((b) => `\`${b}\``).join(", ")}`);
    } else {
      lines.push("- 阻塞: （无 — 若仍 open，等待自动收口或验证）");
    }
    if (run.notes?.length) {
      lines.push(`- 备注: ${run.notes.join("; ")}`);
    }
    lines.push(`- 路径: \`.process-confidence/runs/${run.runId}/\``);
    lines.push("");
    lines.push("**下一步建议**");
    lines.push("");
    lines.push(...nextSteps(run, blockers).map((s) => `- ${s}`));
    lines.push("");
  }

  if (open.length > max) {
    lines.push(`… 另有 ${open.length - max} 条未列出（activeMaxRunsListed=${max}）`);
    lines.push("");
  }

  return lines.join("\n");
}

function nextSteps(run, blockers) {
  if (run.bypass) return ["已 bypass，可结束会话或 abandon"];
  if (blockers.includes("missing-intent-anchors")) {
    return [
      "完善 `stages/01-intent.md`：确保含 `## 非目标` 与 `## 成功标准`",
    ];
  }
  if (blockers.includes("missing-plan-anchors")) {
    return [
      "完善 `stages/02-plan.md`：确保含 `## 涉及文件`、`## 验证`、`## 回滚`",
    ];
  }
  if (blockers.includes("missing-receipt")) {
    return ["运行项目验证命令（如测试）；hook 会签发 receipt 并可能自动收口"];
  }
  if (run.stage === "verify") {
    return ["门禁已满足，Stop 或下一次 hook 将尝试自动 complete"];
  }
  return ["继续实施业务改动，然后运行验证命令"];
}

export function refreshActive(workspaceRoot, config) {
  ensurePcfLayout(workspaceRoot);
  const md = renderActiveMarkdown(workspaceRoot, config);
  writeFileSync(activePath(workspaceRoot), md, "utf8");
  return activePath(workspaceRoot);
}
