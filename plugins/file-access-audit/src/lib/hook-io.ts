import {
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
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

export function extractToolUseId(event) {
  return eventToolUseId(event) || null;
}

export function inferFileOp(toolName) {
  const name = String(toolName ?? "").replaceAll("_", "").toLowerCase();
  if (name === "read") return "read";
  if (name === "write" || name === "createfile") return "write";
  if (name === "edit" || name === "multiedit" || name === "notebookedit" || name === "searchreplace") return "update";
  if (name === "applypatch") return "update";
  return "update";
}

export function extractStructuredFileAccess(event) {
  const toolName = String(extractToolName(event));
  if (!isFileTool(toolName)) return null;
  const paths = extractCoreFileTargets(event, { tools: "read-or-mutation" });
  if (paths.length === 0) return null;
  return { toolName, op: inferFileOp(toolName), paths };
}

export function extractFileTargets(event) {
  return extractStructuredFileAccess(event)?.paths ?? [];
}

export function isShellTool(toolName) {
  return isCoreShellTool(toolName);
}

export function isFileTool(toolName) {
  return isFileMutationTool(toolName) || isReadTool(toolName);
}
