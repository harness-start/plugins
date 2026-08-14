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

export function extractSessionId(event, env = process.env) {
  const value = event?.session_id
    ?? event?.sessionId
    ?? event?.context?.session_id
    ?? env.AI_EXPERTS_SESSION_ID;
  if (typeof value !== "string" || !value.trim() || value === "hook") return null;
  return value.trim();
}

export function platformDataRoot(env = process.env) {
  if (env.CLAUDE_PLUGIN_ROOT && env.CLAUDE_PLUGIN_DATA) {
    return { platform: "claude", root: env.CLAUDE_PLUGIN_DATA };
  }
  if (env.PLUGIN_ROOT && env.PLUGIN_DATA) {
    return { platform: "codex", root: env.PLUGIN_DATA };
  }
  return null;
}

export function additionalContextOutput(hookEventName, text) {
  return { hookSpecificOutput: { hookEventName, additionalContext: text } };
}

export function writeJson(value) {
  if (value !== null && value !== undefined) {
    process.stdout.write(`${JSON.stringify(value)}\n`);
  }
}
