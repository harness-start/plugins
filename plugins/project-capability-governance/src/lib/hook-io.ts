import { isAbsolute, resolve } from "node:path";

import {
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  readStdinJson,
} from "@harness/core/hook-event";
import { additionalContext, preToolDeny, writeJson } from "@harness/core/hook-output";
import {
  extractFileTargets as extractCoreFileTargets,
  extractShellCommand as extractCoreShellCommand,
  isFileMutationTool,
  isShellTool as isCoreShellTool,
} from "@harness/core/hook-targets";

export { readStdinJson, preToolDeny, writeJson };

export function extractCwd(event) {
  return eventCwd(event);
}

export function extractSessionId(event) {
  return eventSessionId(event) || "unknown";
}

export function extractToolName(event) {
  return eventToolName(event);
}

export function extractToolInput(event) {
  return eventToolInput(event);
}

export function extractShellCommand(event) {
  return extractCoreShellCommand(event) ?? "";
}

export function extractShellWorkingDirectory(event) {
  if (!isCoreShellTool(extractToolName(event))) return null;
  const input = extractToolInput(event);
  const value = input?.workdir ?? input?.cwd ?? input?.working_directory ?? input?.workingDirectory;
  if (typeof value !== "string" || !value.trim()) return null;
  return isAbsolute(value) ? resolve(value) : resolve(extractCwd(event), value);
}

export function extractFileTargets(event) {
  return extractCoreFileTargets(event);
}

export function extractWriteContent(event) {
  const input = extractToolInput(event);
  const value = input?.content ?? input?.file_text ?? input?.text;
  if (typeof value === "string") return value;
  if (!/^(?:apply_patch|ApplyPatch)$/u.test(String(extractToolName(event)))) return null;
  const patch = typeof input === "string" ? input : input?.patch ?? input?.input ?? "";
  if (typeof patch !== "string") return null;
  const lines = patch.split("\n");
  const directives = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\*\*\*\s+(?:Add|Update|Delete) File:\s+/u.test(line));
  if (directives.length !== 1 || !/^\*\*\*\s+Add File:\s+/u.test(directives[0].line)) return null;
  const end = lines.indexOf("*** End Patch", directives[0].index + 1);
  if (end < 0) return null;
  const body = lines.slice(directives[0].index + 1, end);
  if (body.length === 0 || body.some((line) => !line.startsWith("+"))) return null;
  return body.map((line) => line.slice(1)).join("\n");
}

export function isFileTool(event) {
  return isFileMutationTool(extractToolName(event));
}

export function isShellTool(event) {
  return isCoreShellTool(extractToolName(event));
}

export function contextOutput(eventName, text) {
  return additionalContext(eventName, text);
}

export function systemMessageOutput(text) {
  return { systemMessage: text };
}
