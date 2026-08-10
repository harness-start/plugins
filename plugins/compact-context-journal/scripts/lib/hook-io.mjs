import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const SHELL = /^(?:Bash|bash|Shell|shell|shell_command|exec_command|exec|local_shell)$/iu;
const READ_FILE = /^(?:Read|read_file|read)$/u;
const WRITE_FILE = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|write_file)$/iu;

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
  return event?.session_id ?? event?.sessionId ?? event?.context?.session_id ?? null;
}

export function extractCwd(event) {
  return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd();
}

export function extractPrompt(event) {
  return typeof event?.prompt === "string" ? event.prompt : typeof event?.user_prompt === "string" ? event.user_prompt : null;
}

export function extractToolName(event) {
  return String(event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "");
}

export function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}

export function extractToolUseId(event) {
  return event?.tool_use_id ?? event?.toolUseId ?? event?.tool_call_id ?? event?.toolCallId ?? event?.tool?.id ?? null;
}

export function extractShellCommand(event) {
  if (!SHELL.test(extractToolName(event))) return null;
  const input = extractToolInput(event);
  const command = input?.command ?? input?.cmd ?? input?.script;
  return typeof command === "string" ? command : null;
}

function stripQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length > 1 && ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1);
  }
  return text;
}

function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const paths = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "notebook_path", "notebookPath"]) {
    if (typeof input[key] === "string" && input[key]) paths.push(input[key]);
  }
  if (Array.isArray(input.edits)) for (const edit of input.edits) paths.push(...objectPaths(edit));
  return paths;
}

function patchPaths(value) {
  if (typeof value !== "string") return [];
  const paths = [];
  for (const line of value.split("\n")) {
    const match = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u) ?? line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (match) paths.push(stripQuotes(match[1]));
  }
  return paths;
}

export function extractFileTargets(event) {
  const tool = extractToolName(event);
  const input = extractToolInput(event);
  const cwd = resolve(extractCwd(event));
  const paths = objectPaths(input);
  const patch = typeof input === "string"
    ? input
    : [input?.patch, input?.input, input?.command].filter((value) => typeof value === "string").join("\n");
  if (WRITE_FILE.test(tool)) paths.push(...patchPaths(patch));
  return [...new Set(paths.filter(Boolean).map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))))];
}

export function physicalPath(path) {
  let cursor = resolve(path);
  const suffix = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) return resolve(path);
    suffix.unshift(cursor.slice(parent.length + 1));
    cursor = parent;
  }
  try {
    return resolve(realpathSync(cursor), ...suffix);
  } catch {
    return resolve(path);
  }
}

export function isShellTool(name) {
  return SHELL.test(String(name));
}

export function isReadFileTool(name) {
  return READ_FILE.test(String(name));
}

export function isWriteFileTool(name) {
  return WRITE_FILE.test(String(name));
}

export function isSubagentEvent(event) {
  return Boolean(
    event?.agent_id ?? event?.agentId ?? event?.subagent_id ?? event?.subagentId ?? event?.is_subagent,
  );
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
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: text } };
}

export function stopDeny(reason) {
  return { decision: "block", reason };
}

export function writeJson(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}\n`);
}
