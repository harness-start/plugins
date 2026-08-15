import { isAbsolute, resolve } from "node:path";

const SHELL_TOOLS = /^(?:Bash|bash|Shell|shell|shell_command|exec_command|exec|local_shell)$/iu;
const FILE_TOOLS = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|Read)$/iu;

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

export function extractToolUseId(event) {
  return (
    event?.tool_use_id ??
    event?.toolUseId ??
    event?.tool_call_id ??
    event?.toolCallId ??
    event?.tool_use?.id ??
    event?.tool?.id ??
    null
  );
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

function patchOps(payload) {
  if (typeof payload !== "string") return [];
  const ops = [];
  for (const line of payload.split("\n")) {
    const file = line.match(/^\*\*\*\s+(Add|Update|Delete) File:\s+(.+)$/u);
    if (file) {
      ops.push({
        op: file[1].toLowerCase() === "add"
          ? "write"
          : file[1].toLowerCase() === "delete"
            ? "delete"
            : "update",
        path: stripMatchingQuotes(file[2]),
      });
      continue;
    }
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (move) {
      ops.push({ op: "move", path: stripMatchingQuotes(move[1]) });
    }
  }
  return ops;
}

export function inferFileOp(toolName) {
  const name = String(toolName ?? "").replaceAll("_", "").toLowerCase();
  if (name === "read") return "read";
  if (name === "write") return "write";
  if (name === "edit" || name === "multiedit" || name === "notebookedit") return "update";
  if (name === "applypatch") return "update";
  return "update";
}

export function extractStructuredFileAccess(event) {
  const toolName = String(extractToolName(event));
  if (!FILE_TOOLS.test(toolName)) return null;
  const input = extractToolInput(event);
  const cwd = resolve(extractCwd(event));
  const canonical = toolName.replaceAll("_", "").toLowerCase();

  if (canonical === "applypatch") {
    const patch = typeof input === "string"
      ? input
      : [input?.patch, input?.input, input?.command]
          .filter((value) => typeof value === "string")
          .join("\n");
    const ops = patchOps(patch);
    if (ops.length === 0) return null;
    return {
      toolName,
      op: ops.length === 1 ? ops[0].op : "update",
      paths: [
        ...new Set(
          ops
            .map((entry) => entry.path)
            .filter(Boolean)
            .map((path) =>
              isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")),
            ),
        ),
      ],
    };
  }

  const paths = objectPaths(input).map((path) =>
    isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")),
  );
  if (paths.length === 0) return null;
  return {
    toolName,
    op: inferFileOp(toolName),
    paths: [...new Set(paths)],
  };
}

export function extractFileTargets(event) {
  const access = extractStructuredFileAccess(event);
  return access?.paths ?? [];
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
