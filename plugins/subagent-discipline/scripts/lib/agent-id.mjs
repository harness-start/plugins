const MAX_AGENT_ID_LEN = 128;

/**
 * Read a path-safe agent id from a hook event.
 * Returns null when missing or unusable — caller must not enter hygiene flow.
 */
export function readAgentId(event) {
  const raw = event?.agent_id ?? event?.agentId;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!id || id.length > MAX_AGENT_ID_LEN) return null;
  if (/[/\0\r\n]/.test(id) || id.includes("..")) return null;
  return id;
}

export function isUsableAgentId(id) {
  return typeof id === "string" && readAgentId({ agent_id: id }) === id;
}
