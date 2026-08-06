/**
 * MySQL replication failover engine.
 * Needs hook event evidence — cannot be a pure command regex rule.
 */

import { splitShellLogicalLines, tokenizeShell } from "../lib/shell-parse.mjs";

function hasProgram(command, programs) {
  return splitShellLogicalLines(command).some((line) =>
    tokenizeShell(line).some((token) =>
      programs.has(token.split("/").at(-1)?.toLowerCase()),
    ),
  );
}

/**
 * @returns {{ action: "deny", id: string, reason: string, recovery: string } | null}
 */
export function mysqlReplicationPreflightFinding(command, event = {}) {
  if (!hasProgram(command, new Set(["mysql", "mysqlsh"]))) return null;
  const mutation = command.match(
    /\b(?:RESET\s+REPLICA\s+ALL|CHANGE\s+REPLICATION\s+SOURCE\s+TO|STOP\s+REPLICA|SET\s+(?:@@GLOBAL\.|GLOBAL\s+)(?:super_)?read_only\s*=\s*(?:0|OFF))\b/iu,
  )?.[0];
  if (!mutation) return null;
  const evidence = JSON.stringify(event);
  const preflight =
    /mysql-replication-preflight/u.test(evidence) &&
    /(?:exit_code|exitCode)["']?\s*:\s*0/u.test(evidence) &&
    !/(?:timed_out|timedOut)["']?\s*:\s*true/u.test(evidence);
  if (preflight) return null;
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
