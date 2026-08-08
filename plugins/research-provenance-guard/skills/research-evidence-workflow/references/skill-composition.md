# Skill composition

Community skills from `skill-deps.json` are **phase workers**. The orchestrator `research-evidence-workflow` owns entry, project paths, MCP seal, and outbound gate.

## Installed deps

| Skill | Role under orchestrator |
| --- | --- |
| `research` | Primary-source investigation technique for subagents; findings Markdown only under inbound/plan paths |
| `firecrawl` | Discovery escalation strategy (search → scrape → map…); **not** direct CLI execution in hard mode |
| `arxiv-search` | Academic candidate discovery only; titles and abstracts are untrusted discovery data, not evidence |
| `handoff` | Post-seal cross-session compaction; must dual-write project `handoffs/outbound/` |

## Adapt rules

1. **Entry:** Never start a multi-claim research task by loading bare `firecrawl`, `research`, or `arxiv-search`. Load this orchestrator and open `.research/runs/<id>/`.
2. **Discover:** Use firecrawl *strategy* (query shape, developer/news categories) but execute via MCP `source_discover`.
3. **Academic discover:** Use `arxiv-search` for query shaping and candidate discovery only. It cannot establish a claim: resolve an authoritative paper URL, then pass its contents through `source_capture` → `source_read` → `source_anchor`.
4. **Pinned-worker degradation:** The audited `deepagents==0.7.5` script exits with no stdout because its CLI discards `query_arxiv()`'s return value, and its result format omits paper IDs and URLs. Treat empty output, a missing `arxiv` package, or a network error as worker unavailable; do not loop or install packages during the run. Continue with MCP discovery or known paper URLs and record any remaining gap.
5. **Research worker:** Subagent briefs may say "follow research skill primary-source discipline" while fixing output to `handoffs/inbound/<id>.result.md`.
6. **Handoff:** Invoke only when `workflow.completeness.sealed` is true; copy exact prompt into `handoffs/outbound/prompt.md`.
7. **skill-trace:** Append phase transitions to `skill-trace.jsonl` via CLI or note them when advancing workflow.

## Soft companions (not skill-deps)

- `subagent-workflow-guard` may govern researcher applications when both plugins are installed; protocols align (reference-first, no secrets).
