import { collectOwnerHookOutput } from "./owner-hook-runtime.js";

export type HookEventName =
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "UserPromptSubmit"
  | "Stop"
  | "SessionStart"
  | "SubagentStart";

export type AdditionalContextOptions = {
  echoStderr?: boolean;
  suppressJson?: boolean;
};

const TOOL_LIFECYCLE_EVENTS = new Set<HookEventName>([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
]);

export function preToolDeny(reason: string): Record<string, unknown> {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

export function additionalContext(
  hookEventName: HookEventName,
  context: string,
  options: AdditionalContextOptions = {},
): Record<string, unknown> | null {
  const codexToolReport = Boolean(process.env.PLUGIN_ROOT)
    && TOOL_LIFECYCLE_EVENTS.has(hookEventName);
  const echoStderr = options.echoStderr ?? codexToolReport;
  const suppressJson = codexToolReport || Boolean(options.suppressJson);
  if (echoStderr) process.stderr.write(`${context}\n`);
  if (suppressJson) return null;
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: context,
    },
  };
}

export function stopBlock(reason: string): Record<string, unknown> {
  return { decision: "block", reason };
}

export function writeJson(value: unknown): void {
  if (value !== null && value !== undefined) {
    if (collectOwnerHookOutput(value)) return;
    process.stdout.write(`${JSON.stringify(value)}\n`);
  }
}
