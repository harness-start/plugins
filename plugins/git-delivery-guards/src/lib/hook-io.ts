import {
  eventCwd,
  eventToolInput,
  eventToolName,
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

export function extractShellCommand(toolName: string, toolInput: HookToolInput): string | null {
  return extractEventShellCommand({ tool_name: toolName, tool_input: toolInput });
}

export function extractWriteTargets(event: HookEvent): string[] {
  return extractFileTargets(event);
}

export function additionalContextOutput(hookEventName: HookEventName, text: string) {
  return additionalContext(hookEventName, text);
}
