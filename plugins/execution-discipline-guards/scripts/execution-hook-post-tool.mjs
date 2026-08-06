#!/usr/bin/env node
import { existsSync } from "node:fs";
import { additionalContextOutput, extractToolInput, extractToolName, extractWriteTargets, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { postFileReports } from "./checks/file-checks.mjs";
import { generatedText, languageDriftReport } from "./checks/language.mjs";
import { recordOutcome } from "./checks/pre-rules.mjs";
const event = await readStdinJson();
if (!event.__parseError) { const input = extractToolInput(event), tool = extractToolName(event), command = input?.command ?? input?.cmd ?? ""; if (typeof command === "string" && command) { const response = event?.tool_response ?? event?.toolResponse ?? event?.response ?? {}; const failure = response?.is_error === true || response?.isError === true || response?.error || Number(response?.exit_code ?? response?.exitCode ?? 0) !== 0; recordOutcome(event, command, failure ? "failure" : "success"); } const reports = extractWriteTargets(tool, input).filter(existsSync).flatMap((path) => postFileReports(event, path, input)); const drift = languageDriftReport(event, generatedText(event)); if (drift) reports.push(drift); if (reports.length) writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n"))); }
