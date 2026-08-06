#!/usr/bin/env node
import { additionalContextOutput, extractShellCommand, extractToolInput, extractToolName, preToolDeny, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { disciplineMessage, preDisciplineFindings } from "./checks/pre-rules.mjs";
const event = await readStdinJson();
if (!event.__parseError) { const input = extractToolInput(event), command = extractShellCommand(extractToolName(event), input) ?? "", findings = preDisciplineFindings(event, command), denied = findings.find((item) => item.action === "deny"); if (denied) writeJson(preToolDeny(disciplineMessage(denied))); else if (findings.length) writeJson(additionalContextOutput("PreToolUse", findings.map(disciplineMessage).join("\n\n"))); }
