# Research Provenance Guard

An opt-in hard research harness for Claude Code and Codex. It turns sources into captured receipts, exact anchors, typed claims, canonical reports, and a fresh completion seal—driven by the **`research-evidence-workflow` orchestrator** and **project workflow files**, not by skill-name heuristics.

## Entry

1. Install the plugin (and optional `skill-deps`: `research`, `firecrawl`, `arxiv-search`, `handoff`).
2. SessionStart injects routing priority: research tasks must start with **`research-evidence-workflow`**, not bare `firecrawl` / `research` / `arxiv-search`.
3. The orchestrator opens a durable run under `.research/runs/<run-id>/workflow.json`.
4. Hard enforcement (Firecrawl CLI block, Stop seal, outbound gate) applies only while that run is open.

There is **no** `$research` / `/research` activation alias. Mentioning a skill name in chat does not open hard mode.

User abort: exactly `# research-abort`. The hook owns the terminal `aborted` transition; the workflow CLI cannot self-authorize abort or completion.

## Project layout

```text
.research/runs/<run-id>/
  workflow.json
  brief.md
  source-plan.md
  skill-trace.jsonl
  handoffs/inbound/*
  handoffs/outbound/*    # only after seal
  claims.draft.json
  research.json          # seal only
  report.md              # seal only
```

Captured source bodies live under the platform plugin data directory (private). Prefer gitignoring `.research/` if you do not want runs in version control.

## Evidence path

`research_begin` binds one run to the MCP workspace root and syncs `workflow.json`. MCP tool identifiers are host-namespaced; select the registered identifier ending in `__research_begin`, `__source_capture`, and so on rather than emitting a raw short-name function call. `source_discover` may use Firecrawl under the hood; discovery is never evidence. `source_capture`, `source_read`, and `source_anchor` build evidence; `research_seal` validates claims and writes the canonical report.

After `research_seal`, evidence mutations and resealing are rejected. A validated Stop changes the workflow to `complete`; later ordinary prompts are not kept in hard mode. Direct edits to `workflow.json`, canonical seal files, or outbound handoff paths are blocked while a run is active.

Final answer: optional pointer to the matching report plus:

```text
Research-Evidence: research-evidence/v1
Research-Run: <run-id>
Research-Seal: sha256:<digest>
```

## Outbound handoff

After seal, use the workflow CLI `handoff-outbound` so `handoffs/outbound/handoff.md` and `prompt.md` (full prompt text) are recorded, then optionally the community `handoff` skill. Direct outbound writes are blocked. This CLI transition is lifecycle metadata and does not stale the already immutable evidence seal.

## Workflow CLI

```bash
node "${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT}/scripts/research-workflow.mjs" run-open --cwd "$PWD"
node ".../research-workflow.mjs" brief-write --cwd "$PWD" --question "..." --scope "..." --as-of "..."
node ".../research-workflow.mjs" handoff-inbound --cwd "$PWD" --file /tmp/inbound.json
node ".../research-workflow.mjs" completeness-check --cwd "$PWD"
node ".../research-workflow.mjs" handoff-outbound --cwd "$PWD" --handoff-file ... --prompt-file ...
```

## Community skills

`skill-deps.json` installs phase workers. `arxiv-search` is pinned to the audited `deepagents==0.7.5` release and is optional candidate discovery only; its titles and abstracts are untrusted and must be resolved to an authoritative paper page, captured, and anchored through MCP. The orchestrator documents failure degradation and how Firecrawl strategy maps to MCP. Direct Firecrawl CLI is blocked during an active run.

## Verification

```bash
node --test plugins/research-provenance-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin research-provenance-guard
```
