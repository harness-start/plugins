---
name: sdd-plan
description: "Create or repair an SDD change plan.md from a valid spec.md, binding the current specification digest and requirement coverage. Use when an SDD specification is ready but its technical plan is missing, invalid, or stale."
---

# SDD Plan

## When to use

- Use when an SDD specification is ready but its technical plan is missing, invalid, or stale.

## Constraints

- do not guess or copy a stale value.
- Before committing, run a pre-mortem, mark every irreversible or one-way-door choice, and put the cheapest kill test for the load-bearing assumption in the existing Risks and Validation sections.

Refuse to plan against an invalid spec. Compute the canonical SHA-256 with the bundled validator's `digest` command; do not guess or copy a stale value.

## Focused exploration

For a cross-module or unfamiliar change, use at most two parallel read-only agents: one for architecture/change surface and one for tests/risks. Use `fork_turns: "none"`, maximum concurrency 2, no nested delegation, a scoped Task Brief with a unique `brief-id`, and a Result Card no larger than 4 KiB that echoes it. The echo is necessary correlation, not proof of direct delivery. Reject a missing/wrong id, unexpected descendant, forbidden tool use, or unverifiable scope; interrupt when possible and use the single-agent fallback. The parent alone resolves tradeoffs and writes `plan.md`.
Use one short host wait for the first Result Card; do not repeatedly extend an unavailable explorer.

## Artifact contract

```markdown
# Plan: <title>

Spec-Digest: sha256:<current spec digest>

## Approach
<implementation approach with every REQ-NNN referenced>

## Change Surface
- <repository-relative path or module>

## Risks
- <risk and mitigation>

## Validation
- <behavioral and automated validation plan>
```

Cover every requirement ID. Prefer the smallest change surface and existing repository conventions. Treat validation entries as future recipes, never as evidence that commands have run. Run the bundled validator after writing and repair every finding before task decomposition.
