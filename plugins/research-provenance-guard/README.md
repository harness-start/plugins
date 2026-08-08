# Research Provenance Guard

An opt-in hard research harness for Claude Code and Codex. It turns sources into captured receipts, exact anchors, typed claims, canonical reports, and a fresh completion seal—driven by the **`research-evidence-workflow` orchestrator** and **project workflow files**, not by skill-name heuristics.

## Entry

1. Install the plugin (and optional `skill-deps`: `research`, `firecrawl`, `handoff`).
2. SessionStart injects routing priority: research tasks must start with **`research-evidence-workflow`**, not bare `firecrawl` / `research`.
3. The orchestrator opens a durable run under `.research/runs/<run-id>/workflow.json`.
4. Hard enforcement (Firecrawl CLI block, Stop seal, outbound gate) applies only while that run is open.

There is **no** `$research` / `/research` activation alias. Mentioning a skill name in chat does not open hard mode.

User abort: exactly `# research-abort`.

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

`research_begin` binds one run to the MCP workspace root and syncs `workflow.json`. `source_discover` may use Firecrawl under the hood; discovery is never evidence. `source_capture`, `source_read`, and `source_anchor` build evidence; `research_seal` validates claims and writes the canonical report.

Final answer: optional pointer to the matching report plus:

```text
Research-Evidence: research-evidence/v1
Research-Run: <run-id>
Research-Seal: sha256:<digest>
```

## Outbound handoff

After seal, use the workflow CLI `handoff-outbound` so `handoffs/outbound/handoff.md` and `prompt.md` (full prompt text) are recorded, then optionally the community `handoff` skill. Hooks block outbound writes before seal.

## Workflow CLI

```bash
node "${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT}/scripts/research-workflow.mjs" run-open --cwd "$PWD"
node ".../research-workflow.mjs" brief-write --cwd "$PWD" --question "..." --scope "..." --as-of "..."
node ".../research-workflow.mjs" handoff-inbound --cwd "$PWD" --file /tmp/inbound.json
node ".../research-workflow.mjs" completeness-check --cwd "$PWD"
node ".../research-workflow.mjs" handoff-outbound --cwd "$PWD" --handoff-file ... --prompt-file ...
```

## Community skills

`skill-deps.json` installs phase workers. The orchestrator skill documents when each is used and how firecrawl strategy maps to MCP. Direct Firecrawl CLI is blocked during an active run.

## Verification

```bash
node --test plugins/research-provenance-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin research-provenance-guard
```
