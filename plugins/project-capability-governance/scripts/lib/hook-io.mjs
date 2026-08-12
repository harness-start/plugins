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
  return event?.session_id ?? event?.sessionId ?? event?.context?.session_id ?? "unknown";
}

export function extractAgentId(event) {
  return event?.agent_id ?? event?.agentId ?? event?.context?.agent_id ?? null;
}

export function extractAgentPrompt(event) {
  const input = event?.tool_input ?? event?.toolInput ?? event?.input ?? {};
  const value = event?.agent_prompt ?? event?.agentPrompt ?? input?.prompt ?? input?.message ?? "";
  return typeof value === "string" ? value : "";
}

export function extractToolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
}

export function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}

export function extractShellCommand(event) {
  if (!SHELL_TOOLS.test(String(extractToolName(event)))) return null;
  const input = extractToolInput(event);
  const value = input?.command ?? input?.cmd ?? input?.script ?? "";
  return typeof value === "string" ? value : "";
}

export function extractShellWorkingDirectory(event) {
  if (!SHELL_TOOLS.test(String(extractToolName(event)))) return null;
  const input = extractToolInput(event);
  const value = input?.workdir ?? input?.cwd ?? input?.working_directory ?? input?.workingDirectory;
  if (typeof value !== "string" || !value.trim()) return null;
  return isAbsolute(value) ? resolve(value) : resolve(extractCwd(event), value);
}

export function extractFileTargets(event) {
  if (!FILE_TOOLS.test(String(extractToolName(event)))) return [];
  const input = extractToolInput(event);
  const cwd = resolve(extractCwd(event));
  const values = [];
  for (const key of ["file_path", "filePath", "path", "target_file"]) {
    if (typeof input?.[key] === "string") values.push(input[key]);
  }
  const patch = typeof input === "string" ? input : input?.patch ?? input?.input ?? "";
  if (typeof patch === "string") {
    for (const line of patch.split("\n")) {
      const match = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
      if (match) values.push(match[1].trim());
    }
  }
  return [...new Set(values.map((value) =>
    isAbsolute(value) ? resolve(value) : resolve(cwd, value.replace(/^\.\//u, "")),
  ))];
}

export function extractWriteContent(event) {
  const input = extractToolInput(event);
  const value = input?.content ?? input?.file_text ?? input?.text;
  if (typeof value === "string") return value;
  if (!/^(?:apply_patch|ApplyPatch)$/u.test(String(extractToolName(event)))) return null;
  const patch = typeof input === "string" ? input : input?.patch ?? input?.input ?? "";
  if (typeof patch !== "string") return null;
  const lines = patch.split("\n");
  const directives = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\*\*\*\s+(?:Add|Update|Delete) File:\s+/u.test(line));
  if (directives.length !== 1 || !/^\*\*\*\s+Add File:\s+/u.test(directives[0].line)) return null;
  const end = lines.indexOf("*** End Patch", directives[0].index + 1);
  if (end < 0) return null;
  const body = lines.slice(directives[0].index + 1, end);
  if (body.length === 0 || body.some((line) => !line.startsWith("+"))) return null;
  return body.map((line) => line.slice(1)).join("\n");
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
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

export function contextOutput(eventName, text) {
  return {
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: text,
    },
  };
}

export function systemMessageOutput(text) {
  return { systemMessage: text };
}

export function writeJson(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}\n`);
}
import { isAbsolute, resolve } from "node:path";

const AGENT_TOOLS = /^(?:Agent|Task|spawn_agent)$/iu;
const FILE_TOOLS = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|create_file|search_replace)$/iu;
const SHELL_TOOLS = /^(?:Bash|bash|Shell|shell|shell_command|exec_command|exec|local_shell)$/iu;
