#!/usr/bin/env node
/**
 * typescript-runtime-guards PreToolUse: lockfile fail-closed deny.
 */
import {
  readStdinJson,
  extractToolName,
  extractToolInput,
  preToolDeny,
  writeJson,
} from "./lib/hook-io.mjs";
import { isWriteTool, isShellTool, normalizeToolName } from "./lib/matchers.mjs";
import {
  collectLockfileTargets,
  lockfileDenyMessage,
} from "./checks/lockfile.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  const rawToolName = extractToolName(event);
  const toolName = normalizeToolName(rawToolName) || rawToolName;
  const toolInput = extractToolInput(event);
  const isWrite = isWriteTool(rawToolName) || isWriteTool(toolName);
  const isShell = isShellTool(rawToolName) || isShellTool(toolName);
  if (!isWrite && !isShell) process.exit(0);

  const lockTargets = collectLockfileTargets({ toolName, input: toolInput });
  if (lockTargets.length > 0) {
    writeJson(preToolDeny(lockfileDenyMessage(lockTargets)));
    process.exit(0);
  }
  process.exit(0);
}

main().catch(() => process.exit(0));
