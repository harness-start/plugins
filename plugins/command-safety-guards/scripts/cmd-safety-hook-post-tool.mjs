#!/usr/bin/env node
import { existsSync } from "node:fs";
import { additionalContextOutput, extractToolInput, extractToolName, extractWriteTargets, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { fileSafetyReports } from "./checks/file-safety.mjs";
const event = await readStdinJson();
if (!event.__parseError) { const input = extractToolInput(event); const reports = extractWriteTargets(extractToolName(event), input).filter(existsSync).flatMap((path) => fileSafetyReports(path, input)); if (reports.length) writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n"))); }
