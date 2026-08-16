import {
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  isRecord,
  readStdinJson,
  type HookEvent,
  type HookToolInput,
} from "@harness/core/hook-event";
import { additionalContext, preToolDeny, writeJson, type HookEventName } from "@harness/core/hook-output";
import { extractFileTargets, extractShellCommand as extractEventShellCommand } from "@harness/core/hook-targets";

export { readStdinJson, writeJson, preToolDeny };
export {
  eventCwd as extractCwd,
  eventToolInput as extractToolInput,
  eventToolName as extractToolName,
};

export function extractSessionId(event: HookEvent): string | null {
  return eventSessionId(event) || null;
}

export function extractFilePath(toolInput: unknown): unknown {
  if (!isRecord(toolInput)) return null;
  return toolInput.file_path ?? toolInput.filePath ?? toolInput.path ?? toolInput.target_file ?? null;
}

export function extractShellCommand(toolName: string, toolInput: HookToolInput): string | null {
  return extractEventShellCommand({ tool_name: toolName, tool_input: toolInput });
}

export function extractWriteTargets(toolNameOrEvent: string | HookEvent, toolInput?: HookToolInput): string[] {
  const event: HookEvent = toolInput === undefined
    ? toolNameOrEvent as HookEvent
    : { tool_name: toolNameOrEvent, tool_input: toolInput, cwd: process.cwd() };
  return extractFileTargets(event, { tools: "any", includeShellWrites: true });
}

export function additionalContextOutput(hookEventName: HookEventName, text: string) {
  return additionalContext(hookEventName, text, {
    echoStderr: Boolean(process.env.PLUGIN_ROOT) && hookEventName === "PostToolUse",
  });
}
