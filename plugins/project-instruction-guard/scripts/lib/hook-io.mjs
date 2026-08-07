const FILE_TOOLS = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|create_file|search_replace)$/iu;
const SHELL_TOOLS = /^(?:Bash|bash|Shell|shell|shell_command|exec_command|exec|local_shell)$/iu;

export async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __parseError: true };
  }
}

export function extractSessionId(event) {
  return event?.session_id
    ?? event?.sessionId
    ?? event?.sessionID
    ?? event?.context?.session_id
    ?? process.env.AI_EXPERTS_SESSION_ID
    ?? null;
}

export function extractCwd(event) {
  return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd();
}

export function extractToolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? event?.name ?? "";
}

export function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}

export function extractToolResponse(event) {
  return event?.tool_response
    ?? event?.toolResponse
    ?? event?.tool_result
    ?? event?.toolResult
    ?? event?.response
    ?? event?.tool?.response
    ?? null;
}

export function extractAssistantMessage(event) {
  const value = event?.last_assistant_message
    ?? event?.lastAssistantMessage
    ?? event?.assistant_text
    ?? event?.assistantText
    ?? "";
  return typeof value === "string" ? value : "";
}

export function extractShellCommand(event) {
  if (!SHELL_TOOLS.test(String(extractToolName(event)))) return null;
  const input = extractToolInput(event);
  const command = input?.command ?? input?.cmd ?? input?.script;
  return typeof command === "string" ? command : null;
}

export function isFileTool(event) {
  return FILE_TOOLS.test(String(extractToolName(event)));
}

export function responseFailed(event) {
  const response = extractToolResponse(event);
  if (!response || typeof response !== "object" || Array.isArray(response)) return false;
  const code = response.exit_code ?? response.exitCode ?? response.code;
  return response.is_error === true
    || response.isError === true
    || response.success === false
    || response.ok === false
    || (typeof code === "number" && code !== 0);
}

export function responseTexts(event) {
  const response = extractToolResponse(event);
  const texts = [];
  const visit = (value, depth) => {
    if (depth > 3 || value === null || value === undefined) return;
    if (typeof value === "string") {
      texts.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 20)) visit(item, depth + 1);
      return;
    }
    if (typeof value === "object") {
      for (const key of ["output", "stdout", "text", "content", "value", "data", "result"]) {
        if (key in value) visit(value[key], depth + 1);
      }
    }
  };
  visit(response, 0);
  if (texts.length === 0) {
    try {
      texts.push(JSON.stringify(response ?? ""));
    } catch {}
  }
  return texts;
}

export function isStopHookActive(event) {
  return event?.stop_hook_active === true || event?.stopHookActive === true;
}

export function additionalContextOutput(text) {
  return { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } };
}

export function stopBlock(reason) {
  return { decision: "block", reason };
}

export function writeJson(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}\n`);
}
