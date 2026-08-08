const FILE_TOOLS = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|create_file|search_replace)$/iu;
const SHELL_TOOLS = /^(?:Bash|bash|Shell|shell|shell_command|exec_command|exec|local_shell)$/iu;

export async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return { __parseError: true }; }
}

export const sessionId = (event) => event?.session_id ?? event?.sessionId ?? process.env.AI_EXPERTS_SESSION_ID ?? null;
export const cwd = (event) => event?.cwd ?? event?.working_directory ?? process.cwd();
export const prompt = (event) => typeof (event?.prompt ?? event?.user_prompt) === "string" ? (event.prompt ?? event.user_prompt) : "";
export const assistantMessage = (event) => typeof (event?.last_assistant_message ?? event?.assistant_text) === "string" ? (event.last_assistant_message ?? event.assistant_text) : "";
export const toolName = (event) => event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
export const toolInput = (event) => event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? {};
export const toolResponse = (event) => event?.tool_response ?? event?.toolResponse ?? event?.tool_result ?? event?.toolResult ?? event?.response ?? null;

export function shellCommand(event) {
  if (!SHELL_TOOLS.test(String(toolName(event)))) return null;
  const input = toolInput(event);
  return typeof (input?.command ?? input?.cmd) === "string" ? (input.command ?? input.cmd) : null;
}

export function fileMutation(event) {
  return FILE_TOOLS.test(String(toolName(event)));
}

export function writeJson(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}\n`);
}
