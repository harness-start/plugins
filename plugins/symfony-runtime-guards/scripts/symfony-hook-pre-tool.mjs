/**
 * Symfony protected paths PreToolUse entry.
 *
 * One process per event; denies writes into Flex/runtime/build generated
 * paths. A clean run exits 0 without output.
 *
 * Covers Claude Write/Edit and Codex apply_patch / shell_command redirects.
 */

import {
  readStdinJson,
  extractToolName,
  extractToolInput,
  extractFilePath,
  extractCwd,
  preToolDeny,
  writeJson,
} from "./lib/hook-io.mjs";
import { isWriteTool, isShellTool } from "./lib/matchers.mjs";
import { patchTargetPaths } from "./lib/patch-utils.mjs";
import {
  protectedPathViolation,
  protectedPathDenyMessage,
} from "./checks/protected-paths.mjs";

function extractShellCommand(toolName, toolInput) {
  if (!isShellTool(toolName)) return null;
  const command = toolInput?.command ?? toolInput?.cmd ?? null;
  return typeof command === "string" ? command : null;
}

function collectTargets(toolName, toolInput, cwd) {
  const targets = [];
  const filePath = extractFilePath(toolInput);
  if (filePath) targets.push(filePath);
  if (typeof toolInput?.path === "string") targets.push(toolInput.path);

  const patchBlob = [toolInput?.patch, toolInput?.input, toolInput?.command]
    .filter((v) => typeof v === "string")
    .join("\n");
  if (patchBlob.includes("*** Begin Patch") || patchBlob.includes("*** Update File")) {
    targets.push(...patchTargetPaths(patchBlob, cwd));
  }

  const command = extractShellCommand(toolName, toolInput);
  if (command) {
    // Redirect / printf targets: `> path` / `>> path`
    for (const m of command.matchAll(/(?:>|>>)\s*([^\s;&|'"]+)/g)) {
      targets.push(m[1]);
    }
    // Also scan free text for known protected path fragments as absolute-ish tokens
    for (const m of command.matchAll(
      /(?:^|[\s'"])((?:\.\/)?(?:var\/cache|var\/log|public\/build|public\/bundles)\/[^\s'";&|]+|symfony\.lock)/g,
    )) {
      targets.push(m[1]);
    }
    if (command.includes("*** Begin Patch")) {
      targets.push(...patchTargetPaths(command, cwd));
    }
  }

  return [...new Set(targets.filter(Boolean))];
}

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  const toolName = extractToolName(event);
  const toolInput = extractToolInput(event);
  const cwd = extractCwd(event);

  if (!isWriteTool(toolName) && !isShellTool(toolName)) process.exit(0);

  for (const target of collectTargets(toolName, toolInput, cwd)) {
    const violation = protectedPathViolation(target);
    if (violation) {
      writeJson(preToolDeny(protectedPathDenyMessage(target, violation)));
      process.exit(0);
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
