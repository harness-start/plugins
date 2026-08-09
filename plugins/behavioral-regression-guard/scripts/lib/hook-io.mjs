import { isAbsolute, resolve } from "node:path";

const SHELL_TOOLS = /^(?:Bash|bash|Shell|shell|shell_command|exec_command|exec|local_shell)$/iu;
const FILE_TOOLS = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|create_file|search_replace)$/iu;

export async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return { __parseError: true }; }
}

export function extractSessionId(event) { return event?.session_id ?? event?.sessionId ?? event?.context?.session_id ?? process.env.AI_EXPERTS_SESSION_ID ?? null; }
export function extractCwd(event) { return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd(); }
export function extractToolName(event) { return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? event?.name ?? ""; }
export function extractToolInput(event) { return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {}; }
export function extractToolResponse(event) { return event?.tool_response ?? event?.toolResponse ?? event?.tool_result ?? event?.toolResult ?? event?.response ?? event?.tool?.response ?? event?.error ?? null; }

export function extractShellCommand(event) {
  if (!SHELL_TOOLS.test(String(extractToolName(event)))) return null;
  const input = extractToolInput(event);
  const command = input?.command ?? input?.cmd ?? input?.script;
  return typeof command === "string" ? command : null;
}

export function extractCommandCwd(event) {
  const input = extractToolInput(event);
  const value = input?.workdir ?? input?.cwd ?? input?.working_directory;
  return typeof value === "string" ? (isAbsolute(value) ? resolve(value) : resolve(extractCwd(event), value)) : resolve(extractCwd(event));
}

function stripQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'")))) return text.slice(1, -1);
  return text;
}

function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const paths = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "targetFile", "output_file", "outputFile"]) if (typeof input[key] === "string") paths.push(input[key]);
  if (Array.isArray(input.paths)) paths.push(...input.paths);
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

function responsePaths(response) {
  if (!response || typeof response !== "object") return [];
  const paths = [];
  if (response.changes && typeof response.changes === "object" && !Array.isArray(response.changes)) paths.push(...Object.keys(response.changes));
  paths.push(...objectPaths(response));
  return paths;
}

export function extractFileTargets(event) {
  if (!FILE_TOOLS.test(String(extractToolName(event)))) return [];
  const input = extractToolInput(event);
  const payload = typeof input === "string" ? input : [input?.patch, input?.input, input?.command].filter((item) => typeof item === "string").join("\n");
  const values = [...objectPaths(input), ...patchPaths(payload), ...responsePaths(extractToolResponse(event))];
  return [...new Set(values.map(stripQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve(path) : resolve(extractCwd(event), path.replace(/^\.\//u, ""))))];
}

function responseText(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const parts = ["stdout", "stderr", "output", "content", "message", "error"].map((key) => value[key]).filter((item) => typeof item === "string");
    if (parts.length > 0) return parts.join("\n");
  }
  try { return JSON.stringify(value ?? ""); } catch { return String(value ?? ""); }
}

export function commandObservation(event, forceFailure = false) {
  const response = extractToolResponse(event);
  const output = responseText(response);
  const timeout = response?.timed_out === true || response?.timedOut === true || response?.interrupted === true || /timed? out|timeout exceeded/iu.test(output);
  if (timeout) return { outcome: "timeout", output, outcomeBasis: "host-timeout" };
  const code = response && typeof response === "object" ? response.exit_code ?? response.exitCode ?? response.code : null;
  if (Number(code) === 127 || /command not found|no such file or directory|not recognized as an internal or external command/iu.test(output)) return { outcome: "missing", output, outcomeBasis: "host-missing" };
  if (forceFailure) return { outcome: "failure", output, outcomeBasis: "failure-event" };
  if (response && typeof response === "object") {
    if (Number.isFinite(Number(code))) return { outcome: Number(code) === 0 ? "success" : "failure", output, outcomeBasis: "exit-status" };
    if (response.is_error === true || response.isError === true || response.success === false || response.error) return { outcome: "failure", output, outcomeBasis: "structured-status" };
    if (response.success === true) return { outcome: "success", output, outcomeBasis: "structured-status" };
  }
  const codes = [...output.matchAll(/(?:Process exited with code|Exit code:?|exited with code)\s+(-?[0-9]+)/giu)];
  if (codes.length > 0) return { outcome: Number(codes.at(-1)[1]) === 0 ? "success" : "failure", output, outcomeBasis: "rendered-exit-status" };
  if (response && typeof response === "object" && !Array.isArray(response) && !process.env.PLUGIN_ROOT) return { outcome: "success", output, outcomeBasis: "host-success" };
  if (typeof response === "string" && !process.env.PLUGIN_ROOT) return { outcome: "success", output, outcomeBasis: "host-success" };
  if (typeof response === "string" && process.env.PLUGIN_ROOT) return { outcome: "unreported", output, outcomeBasis: "literal-oracle" };
  return { outcome: "unknown", output, outcomeBasis: "unavailable" };
}

export function contextOutput(eventName, text) {
  if (process.env.PLUGIN_ROOT && process.env.DEEPSEEK_MODEL && eventName === "PostToolUse") {
    process.stderr.write(`${text}\n`);
    process.exitCode = 2;
    return null;
  }
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: text } };
}

export function stopDeny(reason) { return { decision: "block", reason }; }
export function writeJson(value) { if (value) process.stdout.write(`${JSON.stringify(value)}\n`); }
