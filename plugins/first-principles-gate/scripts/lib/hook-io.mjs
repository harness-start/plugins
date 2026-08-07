import { isAbsolute, resolve } from "node:path";

const SHELL_TOOLS = /^(?:Bash|bash|Shell|shell|shell_command|exec_command|exec|local_shell)$/iu;
const FILE_TOOLS = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|create_file|search_replace)$/iu;

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

export function extractToolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
}

export function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}

export function extractPrompt(event) {
  const value = event?.prompt ?? event?.user_prompt ?? event?.userPrompt ?? event?.message ?? "";
  return typeof value === "string" ? value : "";
}

export function extractAssistantMessage(event) {
  const value =
    event?.last_assistant_message ??
    event?.lastAssistantMessage ??
    event?.assistant_message ??
    "";
  return typeof value === "string" ? value : "";
}

export function extractShellCommand(event) {
  const name = String(extractToolName(event));
  if (!SHELL_TOOLS.test(name)) return null;
  const input = extractToolInput(event);
  const command = input?.command ?? input?.cmd ?? input?.script;
  return typeof command === "string" ? command : null;
}

function stripMatchingQuotes(value) {
  const text = String(value ?? "").trim();
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const paths = [];
  for (const key of [
    "file_path",
    "filePath",
    "path",
    "target_file",
    "output_file",
    "outputFile",
    "notebook_path",
    "notebookPath",
  ]) {
    if (typeof input[key] === "string" && input[key]) paths.push(input[key]);
  }
  if (Array.isArray(input.edits)) {
    for (const edit of input.edits) paths.push(...objectPaths(edit));
  }
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

export function extractFileTargets(event) {
  const name = String(extractToolName(event));
  if (!FILE_TOOLS.test(name) && !/applypatch/iu.test(name.replaceAll("_", ""))) {
    const input = extractToolInput(event);
    if (!objectPaths(input).length) return [];
  }
  const input = extractToolInput(event);
  const cwd = resolve(extractCwd(event));
  const targets = objectPaths(input);
  const patch =
    typeof input === "string"
      ? input
      : [input?.patch, input?.input, input?.command]
          .filter((value) => typeof value === "string")
          .join("\n");
  targets.push(...patchPaths(patch));
  return [
    ...new Set(
      targets
        .map(stripMatchingQuotes)
        .filter(Boolean)
        .map((path) =>
          isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")),
        ),
    ),
  ];
}

export function isFileMutationTool(event) {
  const name = String(extractToolName(event)).replaceAll("_", "").toLowerCase();
  return /^(?:applypatch|edit|multiedit|notebookedit|write|createfile|searchreplace)$/u.test(
    name,
  );
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
  if (process.env.PLUGIN_ROOT && eventName === "PostToolUse") {
    process.stderr.write(`${text}\n`);
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
  return {
    decision: "block",
    reason,
  };
}

export function writeJson(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}\n`);
}
