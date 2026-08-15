import {
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolResponse,
  eventToolUseId,
  readStdinJson,
} from "@harness/core/hook-event";
import { preToolDeny, writeJson } from "@harness/core/hook-output";
import {
  extractFileTargets as extractCoreFileTargets,
  extractShellCommand,
  isFileMutationTool,
  isReadTool,
  isShellTool as isCoreShellTool,
} from "@harness/core/hook-targets";

export { readStdinJson, extractShellCommand, preToolDeny, writeJson };

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

export function extractToolResponse(event) {
  return eventToolResponse(event);
}

export function extractToolUseId(event) {
  return eventToolUseId(event) || null;
}

export function extractFileTargets(event) {
  return extractCoreFileTargets(event, { tools: "read-or-mutation" });
}

export function isShellTool(toolName) {
  return isCoreShellTool(toolName);
}

export function isFileTool(toolName) {
  return isFileMutationTool(toolName) || isReadTool(toolName);
}
