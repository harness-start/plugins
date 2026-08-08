# Skill composition

Community skills from `skill-deps.json` are **phase workers**. The orchestrator `research-evidence-workflow` owns entry, project paths, MCP seal, and outbound gate.

## Installed deps

| Skill | Role under orchestrator |
| --- | --- |
| `research` | Primary-source investigation technique for subagents; findings Markdown only under inbound/plan paths |
| `firecrawl` | Discovery escalation strategy (search → scrape → map…); **not** direct CLI execution in hard mode |
| `handoff` | Post-seal cross-session compaction; must dual-write project `handoffs/outbound/` |

## Adapt rules

1. **Entry:** Never start a multi-claim research task by loading bare `firecrawl` or `research`. Load this orchestrator and open `.research/runs/<id>/`.
2. **Discover:** Use firecrawl *strategy* (query shape, developer/news categories) but execute via MCP `source_discover`.
3. **Research worker:** Subagent briefs may say "follow research skill primary-source discipline" while fixing output to `handoffs/inbound/<id>.result.md`.
4. **Handoff:** Invoke only when `workflow.completeness.sealed` is true; copy exact prompt into `handoffs/outbound/prompt.md`.
5. **skill-trace:** Append phase transitions to `skill-trace.jsonl` via CLI or note them when advancing workflow.

## Soft companions (not skill-deps)

- Local `research-workflow` academic tools (Crossref/arXiv) may feed candidate metadata; still MCP-capture anchorable text or mark `unverified`.
- `subagent-workflow-guard` may govern researcher applications when both plugins are installed; protocols align (reference-first, no secrets).
