# Skill composition

Bundled first-party methods under this orchestrator are **phase techniques**. The orchestrator `research-evidence-workflow` owns entry, project paths, MCP seal, and outbound gate.

## Bundled methods

| Method | Role under orchestrator |
| --- | --- |
| [primary-source-method.md](primary-source-method.md) | Primary-source investigation technique for the parent or an optional ordinary helper; findings are leads, not evidence |
| [discovery-via-mcp.md](discovery-via-mcp.md) | Discovery escalation strategy (search → scrape → map…); **not** direct Firecrawl CLI execution in hard mode |
| Academic candidate discovery | Candidate discovery only; titles and abstracts are untrusted discovery data, not evidence |
| [handoff-method.md](handoff-method.md) | Post-seal cross-session compaction; must dual-write project `handoffs/outbound/` |

## Adapt rules

1. **Entry:** Never start a multi-claim research task by loading a standalone Firecrawl CLI or an unanchored candidate helper. Load this orchestrator and open `.research/runs/<id>/`.
2. **Discover:** Use search *strategy* (query shape, developer/news categories) but execute via MCP `source_discover`.
3. **Academic discover:** Use query shaping and candidate discovery only. It cannot establish a claim: resolve an authoritative paper URL, then pass its contents through `source_capture` → `source_read` → `source_anchor`.
4. **Degradation:** Empty discovery output, a missing executable, or a network error is worker unavailable; do not loop or install packages during the run. Continue with MCP discovery or known paper URLs and record any remaining gap.
5. **Research helper:** For a bounded task, an ordinary read-only helper may follow the primary-source method and return concise source leads in plain language. The parent verifies every lead through MCP capture and anchors.
6. **Handoff:** Invoke only when `workflow.completeness.sealed` is true; copy exact prompt into `handoffs/outbound/prompt.md`.
7. **skill-trace:** Append phase transitions to `skill-trace.jsonl` via CLI or note them when advancing workflow.
