import { currentOwnerHookEvent } from "./owner-hook-runtime.js";

export type HookEvent = Record<string, unknown> & {
  __parseError?: true;
};

export type HookToolInput = Record<string, unknown>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

function nestedRecord(event: HookEvent, key: string): Record<string, unknown> | null {
  const value = event[key];
  return isRecord(value) ? value : null;
}

export async function readStdinJson(
  input: AsyncIterable<Uint8Array | string> = process.stdin,
): Promise<HookEvent> {
  if (input === process.stdin) {
    const current = currentOwnerHookEvent();
    if (current) return current;
  }
  let raw = "";
  for await (const chunk of input) raw += chunk.toString();
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : { __parseError: true };
  } catch {
    return { __parseError: true };
  }
}

export function eventSessionId(event: HookEvent): string {
  const context = nestedRecord(event, "context");
  return firstString(
    event.session_id,
    event.sessionId,
    event.sessionID,
    event.conversation_id,
    event.conversationId,
    context?.session_id,
  );
}

export function eventAgentId(event: HookEvent): string {
  const context = nestedRecord(event, "context");
  return firstString(event.agent_id, event.agentId, context?.agent_id, context?.agentId);
}

export function eventCwd(event: HookEvent): string {
  return firstString(event.cwd, event.working_directory, event.workingDirectory) || process.cwd();
}

export function eventToolName(event: HookEvent): string {
  const tool = nestedRecord(event, "tool");
  return firstString(event.tool_name, event.toolName, tool?.name);
}

export function eventToolInput(event: HookEvent): HookToolInput {
  const tool = nestedRecord(event, "tool");
  const value = event.tool_input ?? event.toolInput ?? tool?.input ?? event.input;
  return isRecord(value) ? value : {};
}

export function eventToolResponse(event: HookEvent): unknown {
  const tool = nestedRecord(event, "tool");
  return event.tool_response
    ?? event.toolResponse
    ?? event.tool_result
    ?? event.toolResult
    ?? event.response
    ?? tool?.response
    ?? null;
}

export function eventToolUseId(event: HookEvent): string {
  const tool = nestedRecord(event, "tool");
  const toolUse = nestedRecord(event, "tool_use");
  return firstString(
    event.tool_use_id,
    event.toolUseId,
    event.tool_call_id,
    event.toolCallId,
    toolUse?.id,
    tool?.id,
  );
}

export function eventPrompt(event: HookEvent): string {
  return firstString(event.prompt, event.user_prompt, event.userPrompt, event.message);
}

export function eventAssistantMessage(event: HookEvent): string {
  return firstString(
    event.last_assistant_message,
    event.lastAssistantMessage,
    event.assistant_message,
    event.assistant_text,
    event.assistantText,
  );
}

export function isStopHookActive(event: HookEvent): boolean {
  return event.stop_hook_active === true || event.stopHookActive === true;
}
