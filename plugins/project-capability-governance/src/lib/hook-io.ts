import { isAbsolute, resolve } from "node:path";

import {
  eventCwd as extractCwd,
  eventSessionId,
  eventToolInput as extractToolInput,
  eventToolName as extractToolName,
  readStdinJson,
  type HookEvent,
} from "@harness/core/hook-event";
import { additionalContext, preToolDeny, writeJson, type HookEventName } from "@harness/core/hook-output";
import {
  extractFileTargets as extractCoreFileTargets,
  extractShellCommand as extractCoreShellCommand,
  isFileMutationTool,
  isShellTool as isCoreShellTool,
} from "@harness/core/hook-targets";

export { readStdinJson, preToolDeny, writeJson, extractCwd, extractToolInput, extractToolName };

export function extractSessionId(event: HookEvent): string {
  return eventSessionId(event) || "unknown";
}

export function extractShellCommand(event: HookEvent): string {
  return extractCoreShellCommand(event) ?? "";
}

export function extractShellWorkingDirectory(event: HookEvent): string | null {
  if (!isCoreShellTool(extractToolName(event))) return null;
  const input = extractToolInput(event);
  const value = input.workdir ?? input.cwd ?? input.working_directory ?? input.workingDirectory;
  if (typeof value !== "string" || !value.trim()) return null;
  return isAbsolute(value) ? resolve(value) : resolve(extractCwd(event), value);
}

export function extractFileTargets(event: HookEvent): string[] {
  return extractCoreFileTargets(event);
}

export function extractWriteContent(event: HookEvent): string | null {
  const input = extractToolInput(event);
  const value = input.content ?? input.file_text ?? input.text;
  if (typeof value === "string") return value;
  if (!/^(?:apply_patch|ApplyPatch)$/u.test(String(extractToolName(event)))) return null;
  const patch = input.patch ?? input.input ?? "";
  if (typeof patch !== "string") return null;
  const lines = patch.split("\n");
  const directives = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\*\*\*\s+(?:Add|Update|Delete) File:\s+/u.test(line));
  const firstDirective = directives[0];
  if (directives.length !== 1 || !firstDirective || !/^\*\*\*\s+Add File:\s+/u.test(firstDirective.line)) return null;
  const end = lines.indexOf("*** End Patch", firstDirective.index + 1);
  if (end < 0) return null;
  const body = lines.slice(firstDirective.index + 1, end);
  if (body.length === 0 || body.some((line) => !line.startsWith("+"))) return null;
  return body.map((line) => line.slice(1)).join("\n");
}

export function isFileTool(event: HookEvent): boolean {
  return isFileMutationTool(extractToolName(event));
}

export function isShellTool(event: HookEvent): boolean {
  return isCoreShellTool(extractToolName(event));
}

export function contextOutput(eventName: HookEventName, text: string) {
  return additionalContext(eventName, text);
}

export function systemMessageOutput(text: string): { systemMessage: string } {
  return { systemMessage: text };
}
