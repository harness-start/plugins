#!/usr/bin/env node

import {
  additionalContextOutput, extractCwd, extractSessionId, extractShellCommand, extractToolInput,
  extractToolName, preToolDeny, readStdinJson, writeJson,
} from "../../lib/hook-io.js";
import {
  classifyDeliveryCommand, formatDeliveryFinding, type DeliveryFinding,
} from "../../checks/command-rules.js";
import { loadConflictConfig, resolveRepoRoot } from "../../checks/file-checks.js";
import { deliveryStateFindings } from "../../checks/state-checks.js";
import {
  isWorktreeCreatePermitted, readWorktreeCreateReceipt, worktreeIsolationRequested,
} from "../../lib/worktree-intent.js";

const WORKTREE_CREATE_ID = "Worktree Create Guard";
const WORKTREE_ISOLATION_FINDING: DeliveryFinding = {
  action: "deny",
  id: WORKTREE_CREATE_ID,
  reason: "unsolicited host isolation: worktree creates an extra linked checkout",
  command: "isolation: worktree",
  recovery: "spawn the subagent in the current checkout; create a worktree only after the user asks for an isolated workspace or a declared process writes an allow receipt",
};

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const toolInput = extractToolInput(event);
  const command = extractShellCommand(extractToolName(event), toolInput);
  const cwd = extractCwd(event);
  const findings: DeliveryFinding[] = command
    ? [...classifyDeliveryCommand(command, cwd), ...deliveryStateFindings(cwd, command)]
    : [];
  if (worktreeIsolationRequested(toolInput)) findings.push(WORKTREE_ISOLATION_FINDING);
  if (!findings.length) return;
  const config = await loadConflictConfig(resolveRepoRoot(cwd));
  const receipt = readWorktreeCreateReceipt(cwd, extractSessionId(event));
  const permitted = isWorktreeCreatePermitted(config.checks.worktreeCreate, receipt);
  const resolved = findings.flatMap((finding) => {
    if (finding.id !== WORKTREE_CREATE_ID) return [finding];
    if (permitted) return [];
    if (config.checks.worktreeCreate === "report") return [{ ...finding, action: "report" as const }];
    return [finding];
  });
  const denied = resolved.find((finding) => finding.action === "deny");
  if (denied) writeJson(preToolDeny(formatDeliveryFinding(denied)));
  else if (resolved.length) {
    writeJson(additionalContextOutput(
      "PreToolUse",
      resolved.map(formatDeliveryFinding).join("\n\n"),
    ));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[git-delivery] pre hook failed open: ${message}\n`);
  process.exit(0);
});
