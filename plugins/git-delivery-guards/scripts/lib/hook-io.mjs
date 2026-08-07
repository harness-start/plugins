import { isAbsolute, resolve } from "node:path";

const FILE_TOOLS = new Set([
  "applypatch", "edit", "multiedit", "notebookedit", "write",
]);

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

export function extractToolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? event?.name ?? "";
}

export function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}

export function extractShellCommand(toolName, toolInput) {
  if (!/^(?:Bash|Shell|bash|shell|shell_command|exec_command|exec|local_shell)$/iu.test(toolName)) return null;
  const command = toolInput?.command ?? toolInput?.cmd ?? null;
  return typeof command === "string" ? command : null;
}

function canonicalToolName(value) {
  return String(value ?? "").replaceAll("_", "").toLowerCase();
}

function stripMatchingQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  )) return text.slice(1, -1);
  return text;
}

export function extractPatchTargets(payload) {
  if (typeof payload !== "string") return [];
  const targets = [];
  for (const line of payload.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    if (file) targets.push(stripMatchingQuotes(file[1]));
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (move) targets.push(stripMatchingQuotes(move[1]));
  }
  return targets;
}

function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const paths = [];
  for (const key of [
    "file_path", "filePath", "path", "target_file", "output_file",
    "outputFile", "notebook_path", "notebookPath",
  ]) {
    if (typeof input[key] === "string" && input[key]) paths.push(input[key]);
  }
  if (Array.isArray(input.edits)) {
    for (const edit of input.edits) paths.push(...objectPaths(edit));
  }
  return paths;
}

export function extractWriteTargets(event) {
  if (!FILE_TOOLS.has(canonicalToolName(extractToolName(event)))) return [];
  const input = extractToolInput(event);
  const cwd = resolve(extractCwd(event));
  const targets = objectPaths(input);
  const patch = typeof input === "string"
    ? input
    : [input?.patch, input?.input, input?.command]
        .filter((value) => typeof value === "string")
        .join("\n");
  targets.push(...extractPatchTargets(patch));
  return [...new Set(targets.map(stripMatchingQuotes).filter(Boolean).map((path) =>
    isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")),
  ))];
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

export function additionalContextOutput(hookEventName, text) {
  return { hookSpecificOutput: { hookEventName, additionalContext: text } };
}

export function writeJson(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}\n`);
}
