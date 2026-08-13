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

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function extractCwd(event) {
  return nonEmptyString(
    event?.cwd ?? event?.working_directory ?? event?.workingDirectory,
  ) ?? process.cwd();
}

export function extractSessionId(event) {
  return nonEmptyString(
    event?.session_id ?? event?.sessionId ?? event?.context?.session_id,
  );
}

export function extractAgentId(event) {
  return nonEmptyString(
    event?.agent_id ?? event?.agentId ?? event?.agent?.id,
  );
}

export function extractAgentType(event) {
  return nonEmptyString(
    event?.agent_type ?? event?.agentType ?? event?.agent?.type,
  );
}

export function extractParentAgentId(event) {
  return nonEmptyString(
    event?.parent_agent_id
      ?? event?.parentAgentId
      ?? event?.parent_agent?.id
      ?? event?.parentAgent?.id,
  );
}

export function extractToolName(event) {
  return nonEmptyString(
    event?.tool_name ?? event?.toolName ?? event?.tool?.name,
  ) ?? "";
}

export function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? {};
}

const SHELL_TOOLS = /^(?:Bash|bash|Shell|shell|shell_command|exec_command|exec|local_shell)$/iu;
const FILE_TOOLS = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|create_file|search_replace)$/iu;

export function extractShellCommand(event) {
  if (!SHELL_TOOLS.test(extractToolName(event))) return null;
  const input = extractToolInput(event);
  const command = input?.command ?? input?.cmd ?? input?.script;
  return typeof command === "string" ? command : null;
}

function stripMatchingQuotes(value) {
  const text = String(value ?? "").trim();
  if (
    text.length >= 2
    && ((text.startsWith('"') && text.endsWith('"'))
      || (text.startsWith("'") && text.endsWith("'")))
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
  if (!FILE_TOOLS.test(extractToolName(event))) return [];
  const input = extractToolInput(event);
  const targets = objectPaths(input);
  const patch = typeof input === "string"
    ? input
    : [input?.patch, input?.input, input?.command]
        .filter((value) => typeof value === "string")
        .join("\n");
  targets.push(...patchPaths(patch));
  return [...new Set(targets.map(stripMatchingQuotes).filter(Boolean))];
}

export function isShellTool(toolName) {
  return SHELL_TOOLS.test(String(toolName ?? ""));
}

export function isFileTool(toolName) {
  return FILE_TOOLS.test(String(toolName ?? ""));
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

export function writeJson(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}\n`);
}
