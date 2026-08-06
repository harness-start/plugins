#!/usr/bin/env node
import { existsSync } from "node:fs";
import { additionalContextOutput, extractToolInput, extractToolName, extractWriteTargets, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { deliveryFileReports } from "./checks/file-checks.mjs";
const event = await readStdinJson();
if (!event.__parseError) { const reports = extractWriteTargets(extractToolName(event), extractToolInput(event)).filter(existsSync).flatMap(deliveryFileReports); if (reports.length) writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n"))); }
