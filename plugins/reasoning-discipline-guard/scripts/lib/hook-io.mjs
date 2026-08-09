import { isAbsolute, resolve } from "node:path";

const FILE_TOOLS = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|create_file|search_replace)$/iu;

export async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return { __parseError: true }; }
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

function toolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? event?.name ?? "";
}

function toolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}

function toolResponse(event) {
  return event?.tool_response
    ?? event?.toolResponse
    ?? event?.tool_result
    ?? event?.toolResult
    ?? event?.response
    ?? event?.tool?.response
    ?? null;
}

function stripQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && (
    (text.startsWith("\"") && text.endsWith("\""))
    || (text.startsWith("'") && text.endsWith("'"))
  )) return text.slice(1, -1);
  return text;
}

function objectPaths(value) {
  if (!value || typeof value !== "object") return [];
  const paths = [];
  for (const key of [
    "file_path", "filePath", "path", "target_file", "targetFile",
    "output_file", "outputFile", "notebook_path", "notebookPath",
  ]) {
    if (typeof value[key] === "string" && value[key]) paths.push(value[key]);
  }
  if (Array.isArray(value.paths)) paths.push(...value.paths);
  if (Array.isArray(value.edits)) {
    for (const edit of value.edits) paths.push(...objectPaths(edit));
  }
  return paths;
}

function patchPaths(value) {
  if (typeof value !== "string") return [];
  const paths = [];
  for (const line of value.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (file) paths.push(stripQuotes(file[1]));
    if (move) paths.push(stripQuotes(move[1]));
  }
  return paths;
}

function responsePaths(value) {
  if (!value) return [];
  if (typeof value === "object") {
    const paths = objectPaths(value);
    if (value.changes && typeof value.changes === "object" && !Array.isArray(value.changes)) {
      paths.push(...Object.keys(value.changes));
    }
    for (const key of ["output", "stdout", "text"]) {
      if (typeof value[key] === "string") paths.push(...responsePaths(value[key]));
    }
    return paths;
  }
  if (typeof value !== "string") return [];
  const paths = [];
  for (const line of value.split("\n")) {
    const status = line.match(/^(?:A|M|D|R[0-9]*)\s+(.+)$/u);
    const changed = line.match(/^(?:added|updated|deleted):\s+(.+)$/iu);
    if (status) paths.push(stripQuotes(status[1]));
    if (changed) paths.push(stripQuotes(changed[1]));
  }
  return paths;
}

export function extractFileTargets(event) {
  const name = String(toolName(event));
  if (!FILE_TOOLS.test(name) && !/applypatch/iu.test(name.replaceAll("_", ""))) return [];
  const cwd = resolve(extractCwd(event));
  const input = toolInput(event);
  const paths = objectPaths(input);
  const patch = typeof input === "string"
    ? input
    : [input?.patch, input?.input, input?.command]
      .filter((item) => typeof item === "string")
      .join("\n");
  paths.push(...patchPaths(patch));
  paths.push(...responsePaths(toolResponse(event)));
  return [...new Set(paths
    .map(stripQuotes)
    .filter(Boolean)
    .map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))))];
}

export function extractAssistantMessage(event) {
  const value = event?.last_assistant_message
    ?? event?.lastAssistantMessage
    ?? event?.assistant_text
    ?? event?.assistantText
    ?? "";
  return typeof value === "string" ? value : "";
}

export function contextOutput(eventName, text) {
  if (process.env.PLUGIN_ROOT && process.env.DEEPSEEK_MODEL && eventName === "PostToolUse") {
    process.stderr.write(`${text}\n`);
    process.exitCode = 2;
    return null;
  }
  return {
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: text,
    },
  };
}

export function stopDeny(reason) {
  return { decision: "block", reason };
}

export function writeJson(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}\n`);
}
