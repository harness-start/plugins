import { eventSessionId, readStdinJson as readCoreStdinJson } from "@harness/core/hook-event";
import { additionalContext, writeJson } from "@harness/core/hook-output";

export const readStdinJson = readCoreStdinJson;
export { writeJson };

export function extractSessionId(event, env = process.env) {
  const value = eventSessionId(event) || env.AI_EXPERTS_SESSION_ID;
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
  return additionalContext(hookEventName, text);
}
