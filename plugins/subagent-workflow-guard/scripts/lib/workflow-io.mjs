import { isAbsolute, resolve } from "node:path";

const AGENT_TOOLS = /^(?:Agent|Task|spawn_agent|collaboration\.spawn_agent)$/iu;
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
  const value = event?.session_id ?? event?.sessionId ?? process.env.AI_EXPERTS_SESSION_ID;
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function extractCwd(event) {
  return resolve(event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd());
}

export function extractToolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
}

export function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}

export function extractToolUseId(event) {
  const value = event?.tool_use_id ?? event?.toolUseId;
  return typeof value === "string" ? value : "";
}

export function extractAgentId(event) {
  const value = event?.agent_id ?? event?.agentId;
  return typeof value === "string" ? value : "";
}

export function extractParentAgentId(event) {
  const value = event?.parent_agent_id ?? event?.parentAgentId;
  return typeof value === "string" ? value : "";
}

export function extractAgentPrompt(event) {
  const input = extractToolInput(event);
  const value = event?.agent_prompt ?? event?.agentPrompt ?? input?.prompt ??
    input?.message ?? input?.task ?? input?.description ?? "";
  return typeof value === "string" ? value : "";
}

export function extractAgentType(event) {
  const input = extractToolInput(event);
  const value = event?.agent_type ?? event?.agentType ?? input?.subagent_type ??
    input?.task_name ?? input?.agent_type ?? "";
  return typeof value === "string" ? value : "";
}

export function extractAssistantMessage(event) {
  const value = event?.last_assistant_message ?? event?.lastAssistantMessage ?? "";
  return typeof value === "string" ? value : "";
}

export function extractPrompt(event) {
  const value = event?.prompt ?? event?.user_prompt ?? event?.userPrompt ?? event?.message ?? "";
  return typeof value === "string" ? value : "";
}

export function extractShellCommand(event) {
  const input = extractToolInput(event);
  const value = input?.command ?? input?.cmd ?? input?.script;
  return typeof value === "string" ? value : "";
}

function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const values = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "outputFile", "notebook_path", "notebookPath"]) {
    if (typeof input[key] === "string" && input[key]) values.push(input[key]);
  }
  if (Array.isArray(input.edits)) {
    for (const edit of input.edits) values.push(...objectPaths(edit));
  }
  return values;
}

function patchPaths(value) {
  if (typeof value !== "string") return [];
  const paths = [];
  for (const line of value.split(/\r?\n/u)) {
    const match = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (match) paths.push(match[1].trim());
    if (move) paths.push(move[1].trim());
  }
  return paths;
}

export function extractFileTargets(event) {
  const input = extractToolInput(event);
  const cwd = extractCwd(event);
  const payload = typeof input === "string" ? input : [input?.patch, input?.input, input?.command]
    .filter((value) => typeof value === "string")
    .join("\n");
  const values = [...objectPaths(input), ...patchPaths(payload)];
  return [...new Set(values.map((value) => {
    const clean = String(value).replace(/^['"]|['"]$/gu, "");
    return isAbsolute(clean) ? resolve(clean) : resolve(cwd, clean.replace(/^\.\//u, ""));
  }))];
}

export function isAgentTool(event) {
  return AGENT_TOOLS.test(String(extractToolName(event)));
}

export function isFileTool(event) {
  return FILE_TOOLS.test(String(extractToolName(event)));
}

export function isShellTool(event) {
  return SHELL_TOOLS.test(String(extractToolName(event)));
}

export function preToolDeny(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
}

export function additionalContext(eventName, text) {
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: text } };
}

export function stopDeny(reason) {
  return { decision: "block", reason };
}

export function writeJson(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}\n`);
}
