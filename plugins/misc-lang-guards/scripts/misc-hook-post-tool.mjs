#!/usr/bin/env node
import { existsSync } from "node:fs";
import { additionalContextOutput, extractToolInput, extractToolName, extractWriteTargets, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { isShellTool, isWriteTool } from "./lib/matchers.mjs";
import { miscFileReports } from "./checks/file-checks.mjs";
const event = await readStdinJson();
if (!event.__parseError) { const tool = extractToolName(event), input = extractToolInput(event); if (isWriteTool(tool) || isShellTool(tool)) { const reports = extractWriteTargets(tool, input).filter(existsSync).flatMap((path) => miscFileReports(path, input)); if (reports.length) writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n"))); } }
