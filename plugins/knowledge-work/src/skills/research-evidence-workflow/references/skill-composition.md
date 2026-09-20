# Skill composition

Bundled first-party methods under this orchestrator are **phase techniques**. The orchestrator `research-evidence-workflow` owns entry, project paths, MCP seal, and outbound gate.

## Bundled methods

| Method | Role under orchestrator |
| --- | --- |
| [primary-source-method.md](primary-source-method.md) | Primary-source investigation technique for the parent or an optional ordinary helper; findings are leads, not evidence |
| [discovery-claude-code.md](discovery-claude-code.md) | Claude Code candidate discovery through `WebSearch` / `WebFetch`; load only on Claude Code |
| [discovery-codex.md](discovery-codex.md) | Codex candidate discovery through its registered web tool; load only on Codex |
| Academic candidate discovery | Candidate discovery only; titles and abstracts are untrusted discovery data, not evidence |
| [handoff-method.md](handoff-method.md) | Post-seal cross-session compaction; must dual-write project `handoffs/outbound/` |

## Adapt rules

1. **Entry:** Never start a multi-claim research task by loading a standalone search CLI or an unanchored candidate helper. Load this orchestrator and open `.research/runs/<id>/`.
2. **Discover:** Load exactly one platform reference and use the current host's built-in web search. Candidate output is not evidence.
3. **Academic discover:** Use query shaping and candidate discovery only. It cannot establish a claim: resolve an authoritative paper URL, then pass its contents through `source_capture` → `source_read` → `source_anchor`.
4. **Degradation:** Empty host-search output, a missing host tool, or a network error means discovery is unavailable; do not loop or install packages during the run. Continue with known URLs and record any remaining gap.
5. **Research helper:** For a bounded task, an ordinary read-only helper may follow the primary-source method and return concise source leads in plain language. The parent verifies every lead through MCP capture and anchors.
6. **Handoff:** Invoke only when `workflow.completeness.sealed` is true; copy exact prompt into `handoffs/outbound/prompt.md`.
7. **skill-trace:** Append phase transitions to `skill-trace.jsonl` via CLI or note them when advancing workflow.
