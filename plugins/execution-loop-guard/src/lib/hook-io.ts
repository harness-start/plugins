import {
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolResponse,
  readStdinJson,
} from "@harness/core/hook-event";
import { additionalContext, preToolDeny, writeJson } from "@harness/core/hook-output";
import { extractFileTargets as extractCoreFileTargets, extractShellCommand } from "@harness/core/hook-targets";

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

export function extractToolResponse(event) {
  return eventToolResponse(event);
}

export function extractToolWait(event) {
  const fullName = String(extractToolName(event));
  const name = fullName.split(".").at(-1)?.toLowerCase();
  const input = extractToolInput(event);
  if (name === "list_agents") return { label: fullName, sleepSeconds: 0, queryCount: 1 };
  if (name === "wait_agent") {
    const milliseconds = Number(input?.timeout_ms ?? input?.timeoutMs ?? 0);
    return milliseconds > 0 ? { label: fullName, sleepSeconds: milliseconds / 1000, queryCount: 0 } : null;
  }
  if (name === "wait" || name === "write_stdin") {
    const milliseconds = Number(input?.yield_time_ms ?? input?.yieldTimeMs ?? 0);
    return milliseconds > 0 ? { label: fullName, sleepSeconds: milliseconds / 1000, queryCount: 0 } : null;
  }
  return null;
}

export function extractFileTargets(event) {
  return extractCoreFileTargets(event);
}

export function contextOutput(eventName, text) {
  return additionalContext(eventName, text, {
    echoStderr: Boolean(process.env.PLUGIN_ROOT) && eventName === "PostToolUse",
    suppressJson: Boolean(process.env.PLUGIN_ROOT) && eventName === "PostToolUse",
  });
}
