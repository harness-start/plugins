/**
 * gateRun / gateSessionStop pure functions.
 */

import { computeBlockers } from "./stage.mjs";
import { listRequiredOpenRunsForStop } from "./scan.mjs";
import { isFeatureOn } from "./config.mjs";

/**
 * Gate a single run for completion.
 * @returns {{ ok: boolean, blockers: string[] }}
 */
export function gateRun(workspaceRoot, run, minSeverity = "pass") {
  if (!run) return { ok: false, blockers: ["run-not-found"] };
  if (run.status === "done") return { ok: true, blockers: [] };
  if (run.status === "abandoned") {
    return { ok: false, blockers: ["run-abandoned"] };
  }
  if (run.bypass === true) return { ok: true, blockers: [] };

  const blockers = computeBlockers(workspaceRoot, run, minSeverity);
  return { ok: blockers.length === 0, blockers };
}

/**
 * Gate session stop for current sessionId.
 * Any still-open required run blocks stop (auto-complete should run first).
 * @returns {{ allow: boolean, flows: object[], orphanWork: boolean, reason?: string }}
 */
export function gateSessionStop(workspaceRoot, sessionId, options = {}) {
  const {
    orphanWork = false,
    orphanWorkStop = "on",
    minSeverity = "pass",
  } = options;

  const required = listRequiredOpenRunsForStop(workspaceRoot, sessionId);
  const flows = required.map((run) => {
    const { blockers } = gateRun(workspaceRoot, run, minSeverity);
    return {
      runId: run.runId,
      title: run.title || run.runId,
      stage: run.stage,
      blockers,
    };
  });

  if (flows.length > 0) {
    return {
      allow: false,
      flows,
      orphanWork: false,
      reason: "open-required-runs",
    };
  }

  if (orphanWork && isFeatureOn(orphanWorkStop)) {
    return {
      allow: false,
      flows: [],
      orphanWork: true,
      reason: "orphan-work",
    };
  }

  return { allow: true, flows: [], orphanWork: false };
}

export function formatStopBlockMessage(gate, sessionId) {
  if (gate.reason === "orphan-work") {
    return [
      "[process-confidence] stop blocked — orphan work without run",
      "harm: 本会话已改业务文件但尚未创建交付流程",
      "unblock:",
      `  - pcf begin --session-id ${sessionId} --title "<任务短标题>"`,
      "  - 或还原改动后重试结束（纯探索可将 orphanWorkStop 关闭）",
    ].join("\n");
  }

  const lines = [
    "[process-confidence] stop blocked — 本会话仍有未收口流程",
    "flows:",
  ];
  for (const f of gate.flows || []) {
    lines.push(`  - ${f.title} (${f.runId}) stage=${f.stage}`);
    if (f.blockers?.length) {
      lines.push(`    blockers: ${f.blockers.join(", ")}`);
    }
  }
  lines.push("unblock:");
  lines.push("  - 补 stages / 运行测试（回执与收口由 hook 自动完成）");
  lines.push(
    `  - 或 pcf abandon --session-id ${sessionId} --run <runId> --reason <…>`,
  );
  return lines.join("\n");
}

export function formatBeginRejected(sessionId) {
  return [
    "[process-confidence] begin rejected",
    "error: session-not-found-in-registry",
    `sessionId: ${sessionId}`,
    "checked: ~/.claude (session-env, projects/*/<id>.jsonl), ~/.codex (session_index.jsonl, sessions/**)",
    "harm: 拒绝绑定到无法证明存在的会话",
    "unblock:",
    "  - 使用 hook 注入的当前 sessionId 重新调用 begin",
    "  - 勿编造或拼接 sessionId",
  ].join("\n");
}
