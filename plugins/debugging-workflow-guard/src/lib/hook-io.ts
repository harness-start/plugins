import { isAbsolute, resolve } from "node:path";

const SHELL_TOOLS = /^(?:Bash|bash|Shell|shell|shell_command|exec_command|exec|local_shell)$/iu;
const FILE_TOOLS = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|create_file|search_replace)$/iu;

export async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return { __parseError: true }; }
}

export function extractSessionId(event) {
  return event?.session_id ?? event?.sessionId ?? event?.sessionID ?? event?.context?.session_id ?? process.env.AI_EXPERTS_SESSION_ID ?? null;
}

export function extractCwd(event) {
  return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd();
}

export function extractAgentId(event) {
  return event?.agent_id ?? event?.agentId ?? "";
}

export function extractAgentPrompt(event) {
  const input = extractToolInput(event);
  return event?.agent_prompt ?? event?.agentPrompt ?? input?.prompt ?? input?.message ?? input?.task ?? input?.description ?? "";
}

export function extractToolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? event?.name ?? "";
}

export function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}

export function extractToolResponse(event) {
  return event?.tool_response ?? event?.toolResponse ?? event?.tool_result ?? event?.toolResult ?? event?.response ?? event?.tool?.response ?? event?.error ?? null;
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

function stripMatchingQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) return text.slice(1, -1);
  return text;
}

function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const paths = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "targetFile", "output_file", "outputFile", "notebook_path", "notebookPath"]) {
    if (typeof input[key] === "string" && input[key]) paths.push(input[key]);
  }
  if (Array.isArray(input.paths)) paths.push(...input.paths);
  if (Array.isArray(input.edits)) for (const edit of input.edits) paths.push(...objectPaths(edit));
  return paths;
}

function patchPaths(payload) {
  if (typeof payload !== "string") return [];
  const paths = [];
  for (const line of payload.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (file) paths.push(stripMatchingQuotes(file[1]));
    if (move) paths.push(stripMatchingQuotes(move[1]));
  }
  return paths;
}

function responsePaths(response) {
  const paths = [];
  if (response && typeof response === "object") {
    if (response.changes && typeof response.changes === "object" && !Array.isArray(response.changes)) paths.push(...Object.keys(response.changes));
    paths.push(...objectPaths(response));
    for (const key of ["output", "stdout", "text"]) if (typeof response[key] === "string") paths.push(...responsePaths(response[key]));
    return paths;
  }
  if (typeof response !== "string") return paths;
  for (const line of response.split("\n")) {
    const status = line.match(/^(?:A|M|D|R[0-9]*)\s+(.+)$/u);
    const changed = line.match(/^(?:added|updated|deleted):\s+(.+)$/iu);
    if (status) paths.push(stripMatchingQuotes(status[1]));
    if (changed) paths.push(stripMatchingQuotes(changed[1]));
  }
  return paths;
}

export function extractFileTargets(event) {
  const name = String(extractToolName(event));
  if (!FILE_TOOLS.test(name) && !/applypatch/iu.test(name.replaceAll("_", ""))) return [];
  const cwd = resolve(extractCwd(event));
  const input = extractToolInput(event);
  const targets = objectPaths(input);
  const patch = typeof input === "string" ? input : [input?.patch, input?.input, input?.command].filter((value) => typeof value === "string").join("\n");
  targets.push(...patchPaths(patch));
  targets.push(...responsePaths(extractToolResponse(event)));
  return [...new Set(targets.map(stripMatchingQuotes).filter(Boolean).map((value) => isAbsolute(value) ? resolve(value) : resolve(cwd, value.replace(/^\.\//u, ""))))];
}

export function isMutationTool(event) {
  const name = String(extractToolName(event)).replaceAll("_", "").toLowerCase();
  return /^(?:applypatch|edit|multiedit|notebookedit|write|createfile|searchreplace)$/u.test(name);
}

function responseText(response) {
  if (typeof response === "string") return response;
  if (response && typeof response === "object" && !Array.isArray(response)) {
    const fields = ["stdout", "stderr", "output", "content", "message"]
      .map((key) => response[key])
      .filter((value) => typeof value === "string");
    if (fields.length > 0) return fields.join("\n");
  }
  try { return JSON.stringify(response ?? ""); } catch { return String(response ?? ""); }
}

export function inferOutcome(event, forceFailure = false) {
  if (forceFailure) return "failure";
  const response = extractToolResponse(event);
  if (response && typeof response === "object") {
    if (response.is_error === true || response.isError === true || response.error || response.interrupted === true) return "failure";
    const code = response.exit_code ?? response.exitCode ?? response.code;
    if (Number.isFinite(Number(code))) return Number(code) === 0 ? "success" : "failure";
    if (response.success === false) return "failure";
    if (response.success === true) return "success";
  }
  const text = responseText(response);
  const codes = [...text.matchAll(/(?:Process exited with code|Exit code:?|exited with code)\s+(-?[0-9]+)/giu)];
  if (codes.length > 0) return Number(codes.at(-1)[1]) === 0 ? "success" : "failure";
  const failed = text.match(/(?:^|\n)#\s*fail\s+([0-9]+)/iu);
  if (failed && Number(failed[1]) > 0) return "failure";
  const passed = text.match(/(?:^|\n)#\s*pass\s+([0-9]+)/iu);
  if (passed && Number(passed[1]) > 0 && (!failed || Number(failed[1]) === 0)) return "success";
  if (/(?:^|\n)not ok\s+[0-9]+\b|command failed|is_error["']?\s*:\s*true/iu.test(text)) return "failure";
  if (!process.env.PLUGIN_ROOT && response && typeof response === "object" && !Array.isArray(response)) return "success";
  return "unknown";
}

export function contextOutput(eventName, text) {
  if (process.env.PLUGIN_ROOT && process.env.DEEPSEEK_MODEL && eventName === "PostToolUse") {
    process.stderr.write(`${text}\n`);
    process.exitCode = 2;
    return null;
  }
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: text } };
}

export function preToolDeny(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
}

export function stopDeny(reason) { return { decision: "block", reason }; }
export function writeJson(value) { if (value) process.stdout.write(`${JSON.stringify(value)}\n`); }
