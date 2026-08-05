/**
 * Shared hook stdin/stdout helpers for Claude Code and Codex.
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

export function writeJson(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

/** SessionStart / UserPromptSubmit context injection */
export function additionalContextOutput(hookEventName, text) {
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: text,
    },
  };
}

/** PreToolUse deny */
export function preToolDeny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

/** Stop block */
export function stopBlock(reason) {
  return {
    decision: "block",
    reason,
  };
}

export function pluginRootFromEnv() {
  return (
    process.env.PLUGIN_ROOT ??
    process.env.CLAUDE_PLUGIN_ROOT ??
    null
  );
}

export function pcfCliHint(sessionId) {
  const root =
    process.env.PLUGIN_ROOT ??
    process.env.CLAUDE_PLUGIN_ROOT ??
    "<plugin-root>";
  const cli = `node "${root}/scripts/pcf-cli.mjs"`;
  return {
    cli,
    beginExample: `${cli} begin --session-id ${sessionId || "<sessionId>"} --title "<短标题>"`,
  };
}
