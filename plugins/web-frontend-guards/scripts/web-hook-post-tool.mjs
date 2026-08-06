#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { additionalContextOutput, extractCwd, extractFilePath, extractShellCommand, extractToolInput, extractToolName, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { isShellTool, isWriteTool } from "./lib/matchers.mjs";
import { patchTargetPaths } from "./lib/patch-utils.mjs";
import { fileReports } from "./checks/file-checks.mjs";

function redirectTargetPaths(command, cwd) {
  if (typeof command !== "string") return [];
  return [...command.matchAll(/(?:^|[^<])>{1,2}(?!>)\s*(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/gu)]
    .map((match) => match[1] ?? match[2] ?? match[3])
    .filter(Boolean)
    .map((path) => path.startsWith("/") ? path : resolve(cwd, path));
}

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const toolName = extractToolName(event);
  if (!isWriteTool(toolName) && !isShellTool(toolName)) return;
  const input = extractToolInput(event);
  const targets = [extractFilePath(input)];
  const command = isShellTool(toolName) ? extractShellCommand(toolName, input) : null;
  const patchPayload = [
    input.patch,
    input.input,
    input.command,
    command,
  ].filter((value) => typeof value === "string").join("\n");
  targets.push(...patchTargetPaths(patchPayload, extractCwd(event)));
  targets.push(...redirectTargetPaths(command, extractCwd(event)));
  const reports = [...new Set(targets.filter(Boolean))].flatMap((target) => existsSync(target) ? fileReports(target, input) : []);
  if (reports.length) writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n")));
}
main().catch(() => process.exit(0));
