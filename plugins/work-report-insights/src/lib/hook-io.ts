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
import { additionalContext, preToolDeny, stopBlock, writeJson } from "@harness/core/hook-output";
import {
  extractFileTargets as extractCoreFileTargets,
  extractShellCommand,
  isFileMutationTool as isCoreFileMutationTool,
  isShellTool as isCoreShellTool,
} from "@harness/core/hook-targets";

export { readStdinJson, extractShellCommand, preToolDeny, writeJson };

export function extractCwd(event) {
  return eventCwd(event);
}

export function extractSessionId(event) {
  return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "hook";
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

export function toolReportedFailure(event) {
  if (event?.error) return true;
  const response = extractToolResponse(event);
  if (response == null) return false;
  if (typeof response === "string") {
    return /\b(?:exit(?:ed)?\s+(?:code|status)|exit_code)\s*[:=]?\s*[1-9]\d*\b|\b(?:command|tool)\s+failed\b/iu.test(response);
  }
  if (typeof response !== "object") return false;
  if (response.isError === true || response.success === false) return true;
  const exitCode = response.exit_code ?? response.exitCode;
  if (Number.isInteger(exitCode) && exitCode !== 0) return true;
  return /^(?:error|failed|failure)$/iu.test(String(response.status ?? response.outcome ?? ""));
}

export function extractPrompt(event) {
  return eventPrompt(event);
}

export function extractAssistantMessage(event) {
  return eventAssistantMessage(event);
}

export function isFileMutationTool(event) {
  return isCoreFileMutationTool(extractToolName(event));
}

export function isShellTool(event) {
  return isCoreShellTool(extractToolName(event));
}

export function extractFileTargets(event) {
  return extractCoreFileTargets(event, { tools: "any" });
}

export function contextOutput(eventName, text) {
  return additionalContext(eventName, text);
}

export function stopDeny(reason) {
  return stopBlock(reason);
}
