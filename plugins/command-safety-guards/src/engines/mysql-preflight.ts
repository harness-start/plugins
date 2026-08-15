/**
 * MySQL replication failover engine.
 * Needs hook event evidence — cannot be a pure command regex rule.
 */

import { shellCommandInvocations } from "../lib/shell-parse.js";

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
    reason: `missing successful replication preflight evidence: ${mutation}`,
    recovery:
      "run mysql-replication-preflight first and verify replication threads, lag, and GTID coverage",
  };
}

export function mysqlPreflightDenyMessage(finding, command = "") {
  return [
    `[${finding.id}] Blocked`,
    "",
    `Reason: ${finding.reason}`,
    `Recovery/alternative: ${finding.recovery}`,
    `Command: ${command}`,
    "",
    "blockingContract:",
    "  observedFacts: The command matches a high-risk replication state change without successful preflight evidence.",
    "  harm: It could cause an unverifiable primary/replica switchover or data inconsistency.",
    "  unblockWhen: Provide successful mysql-replication-preflight evidence.",
    `  recovery: ${finding.recovery}`,
  ].join("\n");
}
