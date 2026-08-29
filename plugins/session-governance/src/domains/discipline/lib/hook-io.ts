import {
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolResponse,
  readStdinJson,
  type HookEvent,
} from "@harness/core/hook-event";
import { additionalContext, preToolDeny, writeJson, type HookEventName } from "@harness/core/hook-output";
import { extractFileTargets as extractCoreFileTargets, extractShellCommand } from "@harness/core/hook-targets";

export type ToolWait = {
  label: string;
  sleepSeconds: number;
  queryCount: number;
};

export { readStdinJson, extractShellCommand, preToolDeny, writeJson };
export {
  eventCwd as extractCwd,
  eventToolInput as extractToolInput,
  eventToolName as extractToolName,
  eventToolResponse as extractToolResponse,
};

export function extractSessionId(event: HookEvent): string | null {
  return eventSessionId(event) || null;
}

export function extractToolWait(event: HookEvent): ToolWait | null {
  const fullName = String(eventToolName(event));
  const name = fullName.split(".").at(-1)?.toLowerCase();
  const input = eventToolInput(event);
  if (name === "list_agents") return { label: fullName, sleepSeconds: 0, queryCount: 1 };
  if (name === "wait_agent") {
    const milliseconds = Number(input.timeout_ms ?? input.timeoutMs ?? 0);
    return milliseconds > 0 ? { label: fullName, sleepSeconds: milliseconds / 1000, queryCount: 0 } : null;
  }
  if (name === "wait" || name === "write_stdin") {
    const milliseconds = Number(input.yield_time_ms ?? input.yieldTimeMs ?? 0);
    return milliseconds > 0 ? { label: fullName, sleepSeconds: milliseconds / 1000, queryCount: 0 } : null;
  }
  return null;
}

export function extractFileTargets(event: HookEvent): string[] {
  return extractCoreFileTargets(event);
}

export function contextOutput(eventName: HookEventName, text: string) {
  return additionalContext(eventName, text, {
    echoStderr: Boolean(process.env.PLUGIN_ROOT) && eventName === "PostToolUse",
    suppressJson: Boolean(process.env.PLUGIN_ROOT) && eventName === "PostToolUse",
  });
}
