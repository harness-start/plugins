const SHELL_TOOLS = /^(?:Bash|bash|Shell|shell|shell_command|exec_command|exec|local_shell)$/iu;
const FILE_TOOLS = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|create_file|search_replace)$/iu;

export async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return { __parseError: true }; }
}

export function extractSessionId(event) {
  return event?.session_id ?? event?.sessionId ?? event?.sessionID ?? event?.context?.session_id ?? null;
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
    ?? event?.error
    ?? null;
}

export function extractPrompt(event) {
  const value = event?.prompt ?? event?.user_prompt ?? event?.userPrompt ?? event?.message ?? "";
  return typeof value === "string" ? value : "";
}

export function extractAssistantMessage(event) {
  const value = event?.last_assistant_message ?? event?.lastAssistantMessage ?? event?.assistant_text ?? event?.assistantText ?? "";
  return typeof value === "string" ? value : "";
}

export function extractShellCommand(event) {
  if (!SHELL_TOOLS.test(String(extractToolName(event)))) return null;
  const input = extractToolInput(event);
  const command = input?.command ?? input?.cmd ?? input?.script;
  return typeof command === "string" ? command : null;
}

export function isFileMutation(event) {
  return FILE_TOOLS.test(String(extractToolName(event)));
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
