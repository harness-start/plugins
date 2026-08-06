/**
 * MySQL replication failover engine.
 * Needs hook event evidence — cannot be a pure command regex rule.
 */

import { shellCommandInvocations } from "../lib/shell-parse.mjs";

function successfulPreflightEvidence(event) {
  const candidates = [
    event,
    event?.mysql_replication_preflight,
    event?.mysqlReplicationPreflight,
    event?.preflight,
  ];
  return candidates.some((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const tool =
      (typeof candidate.tool === "string" && candidate.tool) ||
      candidate.tool_name ||
      candidate.toolName;
    const exitCode = candidate.exit_code ?? candidate.exitCode;
    const timedOut = candidate.timed_out ?? candidate.timedOut;
    return (
      tool === "mysql-replication-preflight" &&
      exitCode !== undefined &&
      exitCode !== null &&
      Number(exitCode) === 0 &&
      timedOut !== true
    );
  });
}

function replicationMutation(command) {
  for (const { executable, args } of shellCommandInvocations(command)) {
    if (!["mysql", "mysqlsh"].includes(executable.toLowerCase())) continue;
    const mutation = args.join(" ").match(
      /\b(?:RESET\s+REPLICA\s+ALL|CHANGE\s+REPLICATION\s+SOURCE\s+TO|STOP\s+REPLICA|SET\s+(?:@@GLOBAL\.|GLOBAL\s+)(?:super_)?read_only\s*=\s*(?:0|OFF))\b/iu,
    )?.[0];
    if (mutation) return mutation;
  }
  return null;
}

/**
 * @returns {{ action: "deny", id: string, reason: string, recovery: string } | null}
 */
export function mysqlReplicationPreflightFinding(command, event = {}) {
  const mutation = replicationMutation(command);
  if (!mutation) return null;
  if (successfulPreflightEvidence(event)) return null;
  return {
    action: "deny",
    id: "MySQL Replication Failover Guard",
    reason: `缺少成功复制 preflight 证据：${mutation}`,
    recovery:
      "先运行 mysql-replication-preflight 并验证复制线程、延迟和 GTID 覆盖",
  };
}

export function mysqlPreflightDenyMessage(finding, command = "") {
  return [
    `[${finding.id}] 已拦截`,
    "",
    `原因：${finding.reason}`,
    `恢复/替代：${finding.recovery}`,
    `命令：${command}`,
    "",
    "blockingContract:",
    "  observedFacts: 命令命中高风险复制状态变更且缺少成功 preflight 证据。",
    "  harm: 可能造成不可验证的主从切换或数据不一致。",
    "  unblockWhen: 补齐 mysql-replication-preflight 成功证据。",
    `  recovery: ${finding.recovery}`,
  ].join("\n");
}
