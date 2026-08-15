import {
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolUseId,
  readStdinJson,
  type HookEvent,
} from "@harness/core/hook-event";
import { preToolDeny, writeJson } from "@harness/core/hook-output";
import {
  extractFileTargets as extractCoreFileTargets,
  extractShellCommand,
  isFileMutationTool,
  isReadTool,
  isShellTool as isCoreShellTool,
} from "@harness/core/hook-targets";

export type FileAccessOp = "read" | "write" | "update";

export type StructuredFileAccess = {
  toolName: string;
  op: FileAccessOp;
  paths: string[];
};

export { readStdinJson, extractShellCommand, preToolDeny, writeJson };
export {
  eventCwd as extractCwd,
  eventToolInput as extractToolInput,
  eventToolName as extractToolName,
};

export function extractSessionId(event: HookEvent): string | null {
  return eventSessionId(event) || null;
}

export function extractToolUseId(event: HookEvent): string | null {
  return eventToolUseId(event) || null;
}

export function inferFileOp(toolName: string): FileAccessOp {
  const name = String(toolName ?? "").replaceAll("_", "").toLowerCase();
  if (name === "read") return "read";
  if (name === "write" || name === "createfile") return "write";
  if (name === "edit" || name === "multiedit" || name === "notebookedit" || name === "searchreplace") return "update";
  if (name === "applypatch") return "update";
  return "update";
}

export function extractStructuredFileAccess(event: HookEvent): StructuredFileAccess | null {
  const toolName = String(eventToolName(event));
  if (!isFileTool(toolName)) return null;
  const paths = extractCoreFileTargets(event, { tools: "read-or-mutation" });
  if (paths.length === 0) return null;
  return { toolName, op: inferFileOp(toolName), paths };
}

export function extractFileTargets(event: HookEvent): string[] {
  return extractStructuredFileAccess(event)?.paths ?? [];
}

export function isShellTool(toolName: string): boolean {
  return isCoreShellTool(toolName);
}

export function isFileTool(toolName: string): boolean {
  return isFileMutationTool(toolName) || isReadTool(toolName);
}
