export async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __parseError: true };
  }
}

export function extractAssistantMessage(event) {
  const message =
    event?.last_assistant_message ??
    event?.lastAssistantMessage ??
    "";
  return typeof message === "string" ? message : "";
}

export function isStopHookActive(event) {
  return event?.stop_hook_active === true || event?.stopHookActive === true;
}

export function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function additionalContextOutput(text) {
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: text,
    },
  };
}

export function stopBlock(reason) {
  return {
    decision: "block",
    reason,
  };
}
