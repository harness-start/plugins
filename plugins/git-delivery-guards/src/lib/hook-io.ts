import {
  eventCwd,
  eventToolInput,
  eventToolName,
  readStdinJson,
} from "@harness/core/hook-event";
import { additionalContext, preToolDeny, writeJson } from "@harness/core/hook-output";
import { extractFileTargets, extractShellCommand as extractEventShellCommand } from "@harness/core/hook-targets";

export { readStdinJson, writeJson, preToolDeny };

export function extractCwd(event) {
  return eventCwd(event);
}

export function extractToolName(event) {
  return eventToolName(event);
}

export function extractToolInput(event) {
  return eventToolInput(event);
}

export function extractShellCommand(toolName, toolInput) {
  return extractEventShellCommand({ tool_name: toolName, tool_input: toolInput });
}

export function extractWriteTargets(event) {
  return extractFileTargets(event);
}

export function additionalContextOutput(hookEventName, text) {
  return additionalContext(hookEventName, text);
}
