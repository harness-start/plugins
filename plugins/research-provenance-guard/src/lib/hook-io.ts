import {
  eventAssistantMessage,
  eventCwd,
  eventPrompt,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolResponse,
  readStdinJson,
  type HookEvent,
} from "@harness/core/hook-event";
import { writeJson } from "@harness/core/hook-output";
import { extractShellCommand, isFileMutationTool } from "@harness/core/hook-targets";

export { readStdinJson, writeJson };
export {
  eventAssistantMessage as assistantMessage,
  eventCwd as cwd,
  eventPrompt as prompt,
  eventToolInput as toolInput,
  eventToolName as toolName,
  eventToolResponse as toolResponse,
};

export function sessionId(event: HookEvent): string | null {
  return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || null;
}

export function shellCommand(event: HookEvent): string | null {
  return extractShellCommand(event);
}

export function fileMutation(event: HookEvent): boolean {
  return isFileMutationTool(eventToolName(event));
}
