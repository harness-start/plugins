#!/usr/bin/env node
import { existsSync } from "node:fs";
import { additionalContextOutput, extractCwd, extractFilePath, extractShellCommand, extractToolInput, extractToolName, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { isShellTool, isWriteTool } from "./lib/matchers.mjs";
import { patchTargetPaths } from "./lib/patch-utils.mjs";
import { fileReports } from "./checks/file-checks.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const toolName = extractToolName(event);
  if (!isWriteTool(toolName) && !isShellTool(toolName)) return;
  const input = extractToolInput(event);
  const targets = [extractFilePath(input)];
  if (isShellTool(toolName)) targets.push(...patchTargetPaths(extractShellCommand(toolName, input) ?? "", extractCwd(event)));
  const reports = [...new Set(targets.filter(Boolean))].flatMap((target) => existsSync(target) ? fileReports(target, input) : []);
  if (reports.length) writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n")));
}
main().catch(() => process.exit(0));
