export const SUBAGENT_CONTEXT = `[Subagent Contract]
Execute only the dispatched scope; do not expand or delegate.
Preserve safety, correctness, and explicit user constraints.
Return findings or changes, evidence, verification, and gaps.
Return conclusions with file:line evidence; never paste whole files back — the parent pays for every byte you return.
Do not re-read large files you have already summarized; reference earlier findings instead.
Do not emit routing, next-step, or session-reflection ceremony.`;

export const HYGIENE_CONTEXT = `[Return Hygiene]
Do not return empty acknowledgements; if nothing found, say what you checked and the gap.
Prefer short conclusions with path:line citations; never paste whole files.
Do not restate the parent brief verbatim.
If you changed code, name the files or summarize the diff; if you ran checks, state the command outcome.`;

export const MAX_CONTEXT_CHARS = 1600;

/** Combined Start injection text (static; no agentId required). */
export function buildSubagentStartContext({ includeHygiene = true } = {}) {
  if (!includeHygiene) return SUBAGENT_CONTEXT;
  const combined = `${SUBAGENT_CONTEXT}\n${HYGIENE_CONTEXT}`;
  if (combined.length > MAX_CONTEXT_CHARS) {
    return combined.slice(0, MAX_CONTEXT_CHARS);
  }
  return combined;
}

export const GITIGNORE_PATTERN = ".subagent-discipline/";
export const LEDGER_DIRNAME = ".subagent-discipline";
