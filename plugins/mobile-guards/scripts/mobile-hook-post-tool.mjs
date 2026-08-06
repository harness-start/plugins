#!/usr/bin/env node
import { existsSync } from "node:fs";
import { additionalContextOutput, extractToolInput, extractToolName, extractWriteTargets, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { isShellTool, isWriteTool } from "./lib/matchers.mjs";
import { mobileFileReports } from "./checks/file-checks.mjs";

const event = await readStdinJson();
if (!event.__parseError) {
  const toolName = extractToolName(event);
  if (isWriteTool(toolName) || isShellTool(toolName)) {
    const reports = extractWriteTargets(toolName, extractToolInput(event)).filter(existsSync).flatMap(mobileFileReports);
    if (reports.length) writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n")));
  }
}
