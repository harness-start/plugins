export type HookEventName =
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "UserPromptSubmit"
  | "Stop"
  | "SessionStart";

export type AdditionalContextOptions = {
  echoStderr?: boolean;
  suppressJson?: boolean;
};

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
  if (options.echoStderr) process.stderr.write(`${context}\n`);
  if (options.suppressJson) return null;
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
    process.stdout.write(`${JSON.stringify(value)}\n`);
  }
}
