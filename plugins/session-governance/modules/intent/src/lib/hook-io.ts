import { eventSessionId, readStdinJson as readCoreStdinJson, type HookEvent } from "@harness/core/hook-event";
import { additionalContext, writeJson, type HookEventName } from "@harness/core/hook-output";

export type PlatformDataRoot = {
  platform: "claude" | "codex";
  root: string;
};

export const readStdinJson = readCoreStdinJson;
export { writeJson };

export function extractSessionId(event: HookEvent, env: NodeJS.ProcessEnv = process.env): string | null {
  const value = eventSessionId(event) || env.AI_EXPERTS_SESSION_ID;
  if (typeof value !== "string" || !value.trim() || value === "hook") return null;
  return value.trim();
}

export function platformDataRoot(env: NodeJS.ProcessEnv = process.env): PlatformDataRoot | null {
  if (env.CLAUDE_PLUGIN_ROOT && env.CLAUDE_PLUGIN_DATA) {
    return { platform: "claude", root: env.CLAUDE_PLUGIN_DATA };
  }
  if (env.PLUGIN_ROOT && env.PLUGIN_DATA) {
    return { platform: "codex", root: env.PLUGIN_DATA };
  }
  return null;
}

export function additionalContextOutput(hookEventName: HookEventName, text: string) {
  return additionalContext(hookEventName, text);
}
