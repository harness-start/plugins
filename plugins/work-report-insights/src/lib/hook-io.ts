import {
  eventAssistantMessage,
  eventCwd,
  eventPrompt,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolResponse,
  isRecord,
  readStdinJson,
  type HookEvent,
} from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson, type HookEventName } from "@harness/core/hook-output";
import {
  extractFileTargets as extractCoreFileTargets,
  extractShellCommand,
  isFileMutationTool as isCoreFileMutationTool,
  isShellTool as isCoreShellTool,
} from "@harness/core/hook-targets";

export { readStdinJson, extractShellCommand, preToolDeny, writeJson };
export {
  eventAssistantMessage as extractAssistantMessage,
  eventCwd as extractCwd,
  eventPrompt as extractPrompt,
  eventToolInput as extractToolInput,
  eventToolName as extractToolName,
  eventToolResponse as extractToolResponse,
};

export function extractSessionId(event: HookEvent): string {
  return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "hook";
}

export function toolReportedFailure(event: HookEvent): boolean {
  if (event.error) return true;
  const response = eventToolResponse(event);
  if (response == null) return false;
  if (typeof response === "string") {
    return /\b(?:exit(?:ed)?\s+(?:code|status)|exit_code)\s*[:=]?\s*[1-9]\d*\b|\b(?:command|tool)\s+failed\b/iu.test(response);
  }
  if (!isRecord(response)) return false;
  if (response.isError === true || response.success === false) return true;
  const exitCode = response.exit_code ?? response.exitCode;
  if (Number.isInteger(exitCode) && exitCode !== 0) return true;
  return /^(?:error|failed|failure)$/iu.test(String(response.status ?? response.outcome ?? ""));
}

export function isFileMutationTool(event: HookEvent): boolean {
  return isCoreFileMutationTool(eventToolName(event));
}

export function isShellTool(event: HookEvent): boolean {
  return isCoreShellTool(eventToolName(event));
}

export function extractFileTargets(event: HookEvent): string[] {
  return extractCoreFileTargets(event, { tools: "any" });
}

export function contextOutput(eventName: HookEventName, text: string) {
  return additionalContext(eventName, text);
}

export function stopDeny(reason: string) {
  return stopBlock(reason);
}
