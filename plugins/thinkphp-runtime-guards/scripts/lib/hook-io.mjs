/**
 * Plugin-local stdin/stdout helpers for Claude Code and Codex hook events.
 * Both platforms deliver hook events as JSON on stdin and expect JSON on
 * stdout with platform-specific field names.
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

export function extractPrompt(event) {
  return (
    event?.prompt ??
    event?.user_prompt ??
    event?.userPrompt ??
    event?.message ??
    ""
  );
}

export function writeJson(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

/** UserPromptSubmit / SessionStart context injection (both platforms). */
export function additionalContextOutput(hookEventName, text) {
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: text,
    },
  };
}
