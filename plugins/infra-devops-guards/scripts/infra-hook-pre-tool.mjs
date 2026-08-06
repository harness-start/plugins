#!/usr/bin/env node
import { additionalContextOutput, extractShellCommand, extractToolInput, extractToolName, preToolDeny, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { isShellTool, isWriteTool, normalizeToolName } from "./lib/matchers.mjs";
import { classifyInfrastructureCommand, infrastructureMessage } from "./checks/command-safety.mjs";
import { lockfileMessage, lockfileTargets } from "./checks/lockfile.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const toolName = normalizeToolName(extractToolName(event));
  const input = extractToolInput(event);
  if (!isWriteTool(toolName) && !isShellTool(toolName)) return;
  const targets = lockfileTargets(toolName, input);
  if (targets.length) { writeJson(preToolDeny(lockfileMessage(targets))); return; }
  if (!isShellTool(toolName)) return;
  const command = extractShellCommand(toolName, input) ?? "";
  const classification = classifyInfrastructureCommand(command);
  if (classification.action === "deny") writeJson(preToolDeny(infrastructureMessage(classification, command)));
  else if (classification.action === "report") writeJson(additionalContextOutput("PreToolUse", infrastructureMessage(classification, command)));
}
main().catch(() => process.exit(0));
