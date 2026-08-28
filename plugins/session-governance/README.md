# session-governance

`session-governance` supplies the cross-cutting behavior expected in almost every Claude Code or Codex session: understand the current intent, choose an appropriate reasoning method, apply disciplined engineering practice, avoid unproductive execution loops, and keep natural-language output in the configured language.

## Purpose

These concerns are not tied to JavaScript, Python, frontend work, or any other domain. They govern how an agent approaches a task. The plugin centralizes them in one always-installed owner so every consumer receives the same session contract without selecting a role bundle or stacking several small governance plugins.

## Design

Five private modules live under `modules/` and remain independently testable: `intent`, `reasoning`, `practice`, `discipline`, and `language`. One owner Hook entrypoint dispatches each lifecycle event to the relevant modules. Hooks handle mechanical observations such as first-prompt claims, retry counts, language-script checks, and completion gates. Skills contain open-ended methods such as intent discovery, first-principles analysis, engineering judgment, review, and verification.

Installing the owner activates the complete surface for both hosts. There are no capability profiles, FDE/OPC branches, or dependencies on globally available Skills.

## Capabilities

| Module | Capability | Typical effect |
| --- | --- | --- |
| `intent` | First-task and materially-new-task discovery | Front-loads relevant repository facts and asks only when an unresolved interpretation changes the implementation |
| `reasoning` | First-principles and exact reasoning methods | Selects a compact method for causal, logical, evidence-heavy, or consequential questions |
| `practice` | Engineering judgment, review checkpoints, read-only review, and completion verification | Encourages scoped changes and fresh evidence without turning ordinary tasks into mandatory ceremony |
| `discipline` | Repeated edit, repeated command, and polling detection | Reports or blocks demonstrably unproductive loops after configured thresholds |
| `language` | Session-wide output-language governance | Keeps prose in the chosen language while preserving code, commands, paths, identifiers, and verbatim material |

## When to use it

Use it as the default foundation for repositories where agents perform implementation, review, research, or operational work. It is useful when tasks frequently change scope within a long conversation, when completion claims require reliable command evidence, when repeated retries can consume a session, or when teams need consistent output language across main agents and subagents.

## When not to use it

Do not treat it as a replacement for a domain workflow. Concrete bug investigation belongs to `engineering-workflow`; Git/CI delivery belongs to `delivery-governance`; source and command protections belong to `workspace-integrity`. It also does not define an organizational role, model profile, permission sandbox, task tracker, or approval chain.

## Runtime behavior

`UserPromptSubmit` routes intent, language, and engineering-practice context. `SessionStart` restores language/practice/reasoning context. `PreToolUse`, `PostToolUse`, and failure events feed only the execution-discipline counters and language feedback that can be mechanically observed. `Stop` and `SubagentStop` enforce the configured output-language boundary. The owner aggregates module feedback but preserves a module's deny decision.

Simple and already-specific requests remain direct. A Skill is never required for a Hook to enforce its mechanical contract, and merely loading a Skill does not prove that a task is complete.

## Public interfaces

Public Skills include `intent-discovery`, `first-principles`, `reasoning-methods`, `engineering-practice`, `engineering-judgment`, `engineering-review-checkpoint`, `engineering-review`, `engineering-verification`, `execution-discipline-config`, and `language-output-config`.

This owner has no public CLI or MCP server. Claude Code and Codex consume the same bundled methods through their platform-specific manifests and Hooks.

## Configuration and state

`discipline` reads project-owned `.execution-discipline.mjs` settings for edit-loop, command-repeat, polling, exemptions, and bypass markers. `language` reads `.language-output.mjs`, then the host-level preference written by the installer, then strict defaults. Its response profile is session-scoped; an optional `artifactProfile` independently governs generated file content when a project has a different stable artifact-language contract. Runtime state is session/workspace-scoped and stores digests, counters, language authorization, and timestamps rather than prompt bodies, command output, or file content.

Configuration Skills diagnose and initialize these files. They do not weaken fixed safety rules silently, and invalid fields fall back according to the responsible module's documented schema.

## Boundaries

The plugin observes only events emitted by the host. It cannot count invisible terminal activity, prove that a reasoning method was followed internally, or turn a passing Hook into outcome evidence. Language checks govern natural-language scripts, not translation quality or tone. Loop detection uses bounded evidence and should not be interpreted as a performance score. Review Skills remain read-only unless a separate user request authorizes implementation.

## Verification

```bash
node --import tsx --test \
  plugins/session-governance/tests/*.test.ts \
  plugins/session-governance/modules/*/tests/*.test.ts
npm run check:dist
```

Live acceptance for Claude Code and Codex must run through `./scripts/acceptance/run.sh --plugin session-governance` inside the repository's Docker acceptance environment.
