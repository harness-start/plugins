type HookEventName = "PreToolUse" | "PostToolUse" | "UserPromptSubmit" | "Stop";

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
): Record<string, unknown> {
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
