#!/usr/bin/env node
import { additionalContextOutput, extractCwd, extractShellCommand, extractToolInput, extractToolName, preToolDeny, readStdinJson, writeJson } from "./lib/hook-io.mjs";
import { classifyDeliveryCommand, formatDeliveryFinding } from "./checks/command-rules.mjs";
import { deliveryStateFindings } from "./checks/state-checks.mjs";
const event = await readStdinJson();
if (!event.__parseError) { const tool = extractToolName(event), input = extractToolInput(event), command = extractShellCommand(tool, input); if (command) { const findings = [...classifyDeliveryCommand(command, extractCwd(event), event), ...deliveryStateFindings(extractCwd(event), command)]; const denied = findings.find((item) => item.action === "deny"); if (denied) writeJson(preToolDeny(formatDeliveryFinding(denied))); else if (findings.length) writeJson(additionalContextOutput("PreToolUse", findings.map(formatDeliveryFinding).join("\n\n"))); } }
