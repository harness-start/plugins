import {
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  readStdinJson,
} from "@harness/core/hook-event";
import { additionalContext, preToolDeny, writeJson } from "@harness/core/hook-output";
import { extractFileTargets, extractShellCommand as extractEventShellCommand } from "@harness/core/hook-targets";

export { readStdinJson, writeJson, preToolDeny };

export function extractSessionId(event) {
  return eventSessionId(event) || null;
}

export function extractCwd(event) {
  return eventCwd(event);
}

export function extractToolName(event) {
  return eventToolName(event);
}

export function extractToolInput(event) {
  return eventToolInput(event);
}

export function extractFilePath(toolInput) {
  if (!toolInput || typeof toolInput !== "object") return null;
  return toolInput.file_path ?? toolInput.filePath ?? toolInput.path ?? toolInput.target_file ?? null;
}

export function extractShellCommand(toolName, toolInput) {
  return extractEventShellCommand({ tool_name: toolName, tool_input: toolInput });
}

export function extractWriteTargets(toolNameOrEvent, toolInput) {
  const event = toolInput === undefined
    ? toolNameOrEvent
    : { tool_name: toolNameOrEvent, tool_input: toolInput, cwd: process.cwd() };
  return extractFileTargets(event, { tools: "any", includeShellWrites: true });
}

export function additionalContextOutput(hookEventName, text) {
  return additionalContext(hookEventName, text, {
    echoStderr: Boolean(process.env.PLUGIN_ROOT) && hookEventName === "PostToolUse",
  });
}
