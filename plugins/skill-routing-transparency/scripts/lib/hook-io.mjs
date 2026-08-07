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

export function extractPrompt(event) {
  return typeof event?.prompt === "string" ? event.prompt : "";
}

export function isSubagentEvent(event) {
  const agentId = event?.agent_id ?? event?.agentId;
  return typeof agentId === "string" && agentId.trim().length > 0;
}

export function additionalContextOutput(hookEventName, text) {
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: text,
    },
  };
}

export function writeJson(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}\n`);
}
