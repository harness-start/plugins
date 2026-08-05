#!/usr/bin/env node
/**
 * thinkphp-runtime-guards PreToolUse entry.
 *
 * Denies writes into ThinkPHP runtime directories.
 * Covers Claude Write/Edit and Codex apply_patch / shell redirects.
 */

import {
  readStdinJson,
  extractToolName,
  extractToolInput,
  extractFilePath,
  extractShellCommand,
  extractCwd,
  preToolDeny,
  writeJson,
} from "./lib/hook-io.mjs";
import { isWriteTool, isShellTool } from "./lib/matchers.mjs";
import {
  protectedPathViolation,
  protectedPathDenyMessage,
} from "./checks/protected-paths.mjs";
import { resolve } from "node:path";

function patchTargetPaths(blob, cwd) {
  if (typeof blob !== "string") return [];
  const paths = [];
  for (const line of blob.split("\n")) {
    const strip = (v) => v.replace(/\\n$/, "").trim();
    const fileMatch = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/);
    if (fileMatch) paths.push(strip(fileMatch[1]));
    const moveMatch = line.match(/^\*\*\*\s+Move to:\s+(.+)$/);
    if (moveMatch) paths.push(strip(moveMatch[1]));
  }
  return paths.map((path) => (path.startsWith("/") ? path : resolve(cwd, path)));
}

function collectTargets(toolName, toolInput, cwd) {
  const targets = [];
  const filePath = extractFilePath(toolInput);
  if (filePath) targets.push(filePath);
  if (typeof toolInput?.path === "string") targets.push(toolInput.path);

  const patchBlob = [toolInput?.patch, toolInput?.input, toolInput?.command]
    .filter((v) => typeof v === "string")
    .join("\n");
  if (patchBlob.includes("***")) {
    targets.push(...patchTargetPaths(patchBlob, cwd));
  }

  const command = extractShellCommand(toolName, toolInput);
  if (command) {
    for (const m of command.matchAll(/(?:>|>>)\s*([^\s;&|'"]+)/g)) {
      targets.push(m[1]);
    }
    for (const m of command.matchAll(
      /(?:^|[\s'"])((?:\.\/)?(?:runtime|Application\/Runtime)\/[^\s'";&|]+)/g,
    )) {
      targets.push(m[1]);
    }
    if (command.includes("***")) {
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
