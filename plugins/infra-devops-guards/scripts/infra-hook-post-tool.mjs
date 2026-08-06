#!/usr/bin/env node
import { existsSync } from "node:fs";
import { additionalContextOutput, extractCwd, extractFilePath, extractShellCommand, extractToolInput, extractToolName, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { isShellTool, isWriteTool } from "./lib/matchers.mjs";
import { patchTargetPaths } from "./lib/patch-utils.mjs";
import { infrastructureFileReports } from "./checks/file-checks.mjs";

const event = await readStdinJson();
if (!event.__parseError) {
  const toolName = extractToolName(event);
  const input = extractToolInput(event);
  if (isWriteTool(toolName) || isShellTool(toolName)) {
    const targets = [extractFilePath(input)];
    if (isShellTool(toolName)) targets.push(...patchTargetPaths(extractShellCommand(toolName, input) ?? "", extractCwd(event)));
    const reports = [...new Set(targets.filter(Boolean))].flatMap((target) => existsSync(target) ? infrastructureFileReports(target) : []);
    if (reports.length) writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n")));
  }
}
