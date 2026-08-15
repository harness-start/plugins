export type HookEvent = Record<string, unknown> & {
  __parseError?: true;
};

export type HookToolInput = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(event: HookEvent, ...keys: string[]): string {
  for (const key of keys) {
    const value = event[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

export async function readStdinJson(
  input: AsyncIterable<Uint8Array | string> = process.stdin,
): Promise<HookEvent> {
  let raw = "";
  for await (const chunk of input) raw += chunk.toString();
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    return isRecord(parsed) ? parsed : { __parseError: true };
  } catch {
    return { __parseError: true };
  }
}

export function eventSessionId(event: HookEvent): string {
  return firstString(event, "session_id", "sessionId", "conversation_id", "conversationId");
}

export function eventCwd(event: HookEvent): string {
  return firstString(event, "cwd", "working_directory", "workingDirectory");
}

export function eventToolName(event: HookEvent): string {
  return firstString(event, "tool_name", "toolName");
}

export function eventToolInput(event: HookEvent): HookToolInput {
  const value = event.tool_input ?? event.toolInput;
  return isRecord(value) ? value : {};
}
