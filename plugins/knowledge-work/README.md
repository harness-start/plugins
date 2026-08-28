# knowledge-work

`knowledge-work` turns information into defensible, readable, and reviewable outputs. It combines evidence-bound research, professional writing support, and evidence-backed daily/weekly/summary reporting in one self-contained Claude Code and Codex plugin.

## Purpose

Research, prose, and reports share a core problem: plausible text is easy to generate, while source provenance, factual boundaries, reader usability, and durable evidence are harder. This owner provides explicit workflows where integrity matters and lighter advisory Skills where deterministic enforcement would be inappropriate.

## Design

Three private modules live under `modules/`: `research`, `writing`, and `reporting`. `research` uses project workflow files, an owner-exposed MCP server, deterministic writers, and Hook gates to bind claims to captured sources. `writing` supplies first-party prose methods plus a bounded Markdown analyzer. `reporting` collects local evidence, separates fact from inference, requires employee acknowledgement, and produces digest-bound reports and ledgers.

Installing the owner activates all bundled Hooks and Skills; there are no capability profiles. Hard workflows activate from durable project state and official commands, not from a Skill-name mention.

## Capabilities

| Module | Capability | Result |
| --- | --- | --- |
| `research` | Source capture, exact anchors, typed claims, seal, and sealed outbound handoff | `.research/runs/<id>` workflow with canonical manifest/report and a verifiable seal |
| `writing` | Action-oriented responses, English/Chinese prose, de-templating, terse mode, visual explanation, and Markdown analysis | Reader-oriented text plus line-anchored deterministic findings for observed Markdown writes |
| `reporting` | Daily, weekly, and summary evidence collection; bounded interview; employee acknowledgement; TL review; append/verify | Markdown report and digest-bound ledger with evidence strength and follow-up matrix |

Public Skills include `research-evidence-workflow`, `professional-writing`, `actionable-response`, `visual-explanation`, `writing-english-prose`, `writing-chinese-prose`, `writing-markdown-ai-style`, `writing-terse-output`, `ai-flavor-remover`, `work-report-authoring`, `work-report-interview`, and `work-report-review`.

## When to use it

Use `research` for multi-source investigations, technical or product decisions requiring citations, or any deliverable where claims must remain connected to exact captured evidence. Use `writing` when prose must be clearer, more natural, more actionable, or less formulaic. Use `reporting` for employee daily/weekly/phase summaries that must distinguish observed work, impact, gaps, commitments, and TL verification.

## When not to use it

Do not open a sealed research workflow for a simple lookup or explanation that needs no durable evidence package. Do not use writing analysis as an AI-detector or claim that fewer style findings prove authorship or quality. Do not use work reporting to calculate a performance score, search an entire home directory, authenticate external accounts, upload data, or send a report automatically.

## Runtime behavior

`SessionStart` restores relevant research/report state and provides lightweight writing routing. `UserPromptSubmit` recognizes explicit research and reporting intent. `PreToolUse`, post-tool, failure, and `Stop` events enforce only active research/report workflows and protected paths. Writing's post-tool analyzer scans bounded observed Markdown writes and reports findings without automatically rewriting or blocking them.

The research module distinguishes candidate discovery from evidence: only content captured and anchored through `research_provenance` can support canonical claims. Reporting distinguishes attributed local evidence, unverified ownership, inference, employee disposition, and future TL checks.

## Public interfaces

The unified CLI is:

```bash
node "${PLUGIN_ROOT}/dist/cli/harness.mjs" <resource> <action> [arguments]
```

Resources:

- `research`: forwards workflow actions such as `run-open`, `brief-write`, `completeness-check`, and `handoff-outbound`;
- `writing`: exposes `analyze` for deterministic Markdown style analysis;
- `report`: exposes daily, weekly, and summary `collect`, `prepare`, `save`, and transcript-scan actions plus `addition-prepare`, `append`, and `verify`.

The public MCP server is named `research_provenance`. It provides workspace-bound research begin, source discovery/capture/read/anchor, claim/seal, and related provenance operations through the host's MCP namespace.

## Configuration and state

Research workflow artifacts live under `.research/runs/`; private captured bodies and MCP events use the platform plugin-data directory. Work reports and their ledgers live in the selected report tree and use SHA-256 binding plus acknowledgement tokens. The writing module creates no workflow state and scans only bounded file sizes/counts. Optional authenticated `gh` or `glab` queries are repository-scoped and never trigger login.

## Boundaries

A research seal proves consistency inside the observable workflow; it is not a cryptographic signature against a malicious same-user process, and unverified claims must remain labeled. Writing methods preserve facts only when the source text and review process do. Report evidence may be incomplete or unattributed and must not be inflated into performance conclusions. Hooks and extra model turns are not outcome evidence by themselves.

## Verification

```bash
node --import tsx --test \
  plugins/knowledge-work/tests/*.test.ts \
  plugins/knowledge-work/modules/*/tests/*.test.ts
npm run check:dist
```

Live Claude Code and Codex cases must use `./scripts/acceptance/run.sh --plugin knowledge-work`, which applies the Docker host-acceptance policy.
