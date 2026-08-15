import {
  eventAssistantMessage,
  eventCwd,
  eventPrompt,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolResponse,
  readStdinJson,
} from "@harness/core/hook-event";
import { writeJson } from "@harness/core/hook-output";
import { extractShellCommand, isFileMutationTool } from "@harness/core/hook-targets";

export { readStdinJson, writeJson };

export const sessionId = (event) => eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || null;
export const cwd = (event) => eventCwd(event);
export const prompt = (event) => eventPrompt(event);
export const assistantMessage = (event) => eventAssistantMessage(event);
export const toolName = (event) => eventToolName(event);
export const toolInput = (event) => eventToolInput(event);
export const toolResponse = (event) => eventToolResponse(event);

export function shellCommand(event) {
  return extractShellCommand(event);
}

export function fileMutation(event) {
  return isFileMutationTool(toolName(event));
}
