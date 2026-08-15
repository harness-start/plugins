---
name: sdd-specify
description: Create or repair an SDD change spec.md with intent, requirements, scenarios, and non-goals. Use when an SDD change has no valid spec, requirements are unclear, or an upstream specification must be revised before planning.
---

# SDD Specify

Write the smallest contract that makes the change testable. Read the touched code, tests, project rules, and current behavior before inventing requirements.

## Discovery budget

- For a familiar, bounded change, inspect directly without a worker.
- For unfamiliar Brownfield code, dispatch one read-only fact scout.
- For cross-module, public-contract, security, schema, migration, or other high-risk work, add one adversarial scout with a distinct question.
- Use `fork_turns: "none"`, maximum concurrency 2, and no nested delegation. Fall back to the parent when isolated subagents are unavailable.

Give scouts a scoped Task Brief with a unique `brief-id` and require a Result Card no larger than 4 KiB that echoes it. The echo is necessary correlation, not proof of direct delivery. Reject a missing/wrong id, unexpected descendant, forbidden tool use, or unverifiable scope; interrupt when possible and use the parent fallback. The parent reconciles conflicts and writes `spec.md`; scouts never edit `.specs/**`.
Use one short host wait for the first Result Card; do not repeatedly extend an unavailable scout.

## Artifact contract

Use exactly this shape:

```markdown
# Spec: <title>

## Intent
<why and observable outcome>

## Requirements

### REQ-001: <title>
<behavioral requirement>

#### Scenario: <name>
- Given <precondition>
- When <action>
- Then <observable result>

## Non-goals
- <explicit exclusion>
```

Assign unique `REQ-NNN` IDs. Give every requirement at least one non-empty Given/When/Then scenario. Remove `TODO`, `TBD`, `NEEDS CLARIFICATION`, and `[?]`. Do not embed design decisions unless they are part of the user-visible contract.

After writing, run the bundled validator. If an old plan or tasks becomes stale, report that as the expected recovery path; do not preserve an obsolete digest.
