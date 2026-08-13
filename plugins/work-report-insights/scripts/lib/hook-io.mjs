import { isAbsolute, resolve } from "node:path";

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

export function extractCwd(event) {
  return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd();
}

export function extractSessionId(event) {
  return event?.session_id ?? event?.sessionId ?? event?.context?.session_id ?? process.env.AI_EXPERTS_SESSION_ID ?? "hook";
}

export function extractAgentId(event) {
  return event?.agent_id ?? event?.agentId ?? "";
}

export function extractAgentPrompt(event) {
  const input = extractToolInput(event);
  return event?.agent_prompt ?? event?.agentPrompt ?? input?.prompt ?? input?.message ?? input?.task ?? input?.description ?? "";
}

export function extractToolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
}

export function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}

export function extractToolResponse(event) {
  return event?.tool_response ?? event?.toolResponse ?? event?.tool_result ?? event?.toolResult ?? event?.response ?? event?.tool?.response ?? null;
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
  const value = event?.prompt ?? event?.user_prompt ?? event?.userPrompt ?? event?.message ?? "";
  return typeof value === "string" ? value : "";
}

export function extractAssistantMessage(event) {
  const value = event?.last_assistant_message ?? event?.lastAssistantMessage ?? event?.assistant_message ?? "";
  return typeof value === "string" ? value : "";
}

export function isFileMutationTool(event) {
  return FILE_TOOLS.test(String(extractToolName(event)));
}

export function isShellTool(event) {
  return SHELL_TOOLS.test(String(extractToolName(event)));
}

export function extractShellCommand(event) {
  if (!isShellTool(event)) return null;
  const input = extractToolInput(event);
  const value = input?.cmd ?? input?.command ?? input?.script;
  return typeof value === "string" ? value : null;
}

function stripQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length > 1 && ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'")))) return text.slice(1, -1);
  return text;
}

function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const paths = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "outputFile", "notebook_path", "notebookPath"]) {
    if (typeof input[key] === "string") paths.push(input[key]);
  }
  if (Array.isArray(input.edits)) for (const edit of input.edits) paths.push(...objectPaths(edit));
  return paths;
}

function patchPaths(payload) {
  if (typeof payload !== "string") return [];
  const paths = [];
  for (const line of payload.split("\n")) {
    const match = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u) ?? line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (match) paths.push(stripQuotes(match[1]));
  }
  return paths;
}

export function extractFileTargets(event) {
  const input = extractToolInput(event);
  const payload = typeof input === "string" ? input : [input?.patch, input?.input, input?.command].filter((item) => typeof item === "string").join("\n");
  const paths = [...objectPaths(input), ...patchPaths(payload)];
  const cwd = resolve(extractCwd(event));
  return [...new Set(paths.map(stripQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path)))];
}

export function contextOutput(eventName, text) {
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: text } };
}

export function preToolDeny(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
}

export function stopDeny(reason) {
  return { decision: "block", reason };
}

export function writeJson(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}\n`);
}
