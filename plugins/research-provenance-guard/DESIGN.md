# Research Provenance Guard design

## Contract

Hard research is entered only through the orchestrator skill `research-evidence-workflow`, which opens a durable project run under `.research/runs/<run-id>/`. Completion is allowed only when every final claim is in a server-generated manifest/report and the final response references a fresh, same-session MCP seal whose artifact hashes still match.

SessionStart may inject **routing priority** so research tasks load the orchestrator instead of bare `research` / `firecrawl` skills. That banner is not activation. Hard enforcement starts only when a project workflow file is open.

## Causal chain

```text
orchestrator skill entry
  -> project workflow.json (open)
  -> brief + source plan + inbound subagent handoffs
  -> MCP roots/list workspace binding
  -> candidate discovery (non-evidence; MCP or adapted firecrawl technique)
  -> bounded source capture in private plugin data
  -> exact captured-content anchors
  -> typed claim validation
  -> canonical manifest + report (seal-only workspace files)
  -> outbound handoff only after sealed (prompt recorded)
  -> observed research_seal receipt at epoch/revision
  -> offline Stop revalidation of trailer + files + digest
```

Hook activation, SessionStart text, skill-deps installation, or extra model turns alone are not outcome evidence. Outcome-level checks are workflow phase, anchor resolution, claim status rules, canonical artifact generation, artifact hash recomputation, receipt matching, and freshness after the last observed mutation.

## Project workflow files

Authoritative orchestration state lives in the workspace:

```text
.research/runs/<run-id>/
  workflow.json
  brief.md
  source-plan.md
  skill-trace.jsonl
  handoffs/inbound/*
  handoffs/outbound/*   # only after sealed
  claims.draft.json
  research.json         # seal only
  report.md             # seal only
```

Captured source bodies and MCP event streams remain under the platform plugin data directory with private permissions. `.firecrawl/` output is never evidence until re-captured through MCP.

## Write policy

| Path | Writer |
| --- | --- |
| workflow, brief, source-plan, skill-trace, inbound handoffs, claims.draft | Orchestrator / workflow CLI / agent under an open run |
| `research.json`, `report.md` | Only `research_seal` |
| `handoffs/outbound/**` | Only after `completeness.sealed` (or phase `sealed`+) |

## Skill composition

`skill-deps.json` installs phase workers, not alternate entries:

- `research` — discover/read technique for subagents; findings land under inbound paths.
- `firecrawl` — discovery strategy only; hard-run execution is MCP `source_discover` / `source_capture`.
- `handoff` — post-seal outbound session handoff; project `outbound/prompt.md` must store the exact prompt.

## State and concurrency

Hook observations are append-only event files (TTL 24h) keyed by session and workspace. Active mode is reconstructed from project `workflow.json` phases plus hook receipts. A server process permits one unfinished MCP run and is scoped to one workspace root.

The parent session owns seal and outbound handoff. Subagents may capture-read or draft notes through inbound handoffs; their prose cannot create a seal receipt.

## Trust boundaries

- MCP `roots/list` is authoritative for workspace scope.
- Direct HTTP pins DNS public checks on every redirect.
- The seal digest is integrity within the observable workflow, not a signature against a hostile same-user process.

## Degradation

Missing Firecrawl affects discovery only. Missing plugin data or MCP roots fails the authoritative path closed. User abort is exactly `# research-abort`. Unverified claims require a visible limitation and must not be presented as verified facts outside the canonical report.
