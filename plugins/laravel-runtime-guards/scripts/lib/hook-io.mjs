/**
 * Plugin-local stdin/stdout helpers for Claude Code and Codex hook events.
 *
 * Both platforms deliver hook events as JSON on stdin and expect JSON on
 * stdout with platform-specific field names. This module normalizes the
 * differences so the rest of the plugin can work with one shape.
 */

export async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __parseError: true, raw };
  }
}

export function extractSessionId(event) {
  return (
    event?.session_id ??
    event?.sessionId ??
    event?.sessionID ??
    event?.context?.session_id ??
    null
  );
}

export function extractCwd(event) {
  return (
    event?.cwd ??
    event?.working_directory ??
    event?.workingDirectory ??
    process.cwd()
  );
}

export function extractToolName(event) {
  return (
    event?.tool_name ??
    event?.toolName ??
    event?.tool?.name ??
    event?.name ??
    ""
  );
}

export function extractToolInput(event) {
  return (
    event?.tool_input ??
    event?.toolInput ??
    event?.tool?.input ??
    event?.input ??
    {}
  );
}

export function extractFilePath(toolInput) {
  if (!toolInput || typeof toolInput !== "object") return null;
  return (
    toolInput.file_path ??
    toolInput.filePath ??
    toolInput.path ??
    toolInput.target_file ??
    null
  );
}

export function extractShellCommand(toolName, toolInput) {
  if (
    !/^(Bash|Shell|bash|shell|shell_command|exec_command|exec|local_shell)$/i.test(
      toolName,
    )
  ) {
    return null;
  }
  const command = toolInput?.command ?? toolInput?.cmd ?? null;
  return typeof command === "string" ? command : null;
}

export function writeJson(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

/** PreToolUse deny (both platforms). */
export function preToolDeny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

/** PreToolUse / PostToolUse report (additionalContext, both platforms). */
export function additionalContextOutput(hookEventName, text) {
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: text,
    },
  };
}
