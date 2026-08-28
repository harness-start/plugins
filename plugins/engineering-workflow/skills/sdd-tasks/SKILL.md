---
name: sdd-tasks
description: Create or repair an SDD change tasks.md from current spec and plan artifacts, with requirement traceability, dependencies, file scopes, and verification recipes. Use when an SDD plan is valid but executable tasks are missing, invalid, or stale.
---

# SDD Tasks

Validate `spec.md` and `plan.md`, then compute both current digests with the bundled validator. Never decompose a stale plan.

If the change needs three or more tasks or appears parallelizable, use one read-only decomposition reviewer. Give it a scoped Task Brief with a unique `brief-id`, use `fork_turns: "none"`, allow no nested delegation, and require a Result Card no larger than 4 KiB that echoes the id. The echo is necessary correlation, not proof of direct delivery. Reject a missing/wrong id, unexpected descendant, forbidden tool use, or unverifiable scope; interrupt when possible and use the single-agent fallback. Otherwise use the parent. The parent writes `tasks.md`.
Use one short host wait for the first Result Card; do not repeatedly extend an unavailable reviewer.

## Artifact contract

```markdown
# Tasks: <title>

Spec-Digest: sha256:<current spec digest>
Plan-Digest: sha256:<current plan digest>

## TASK-001: <outcome>
- Requirement: REQ-001
- Depends: none
- Files: test/example.test.js
- Verify: node --test test/example.test.js
```

Use unique `TASK-NNN` IDs. List comma-separated requirement IDs, dependencies, and repository-relative literal files. Use `none` only for an empty dependency set. Make the graph acyclic and cover every requirement. Tasks that are mutually unreachable in the dependency graph are parallel candidates and must not name equal or parent/child-overlapping Files. `Verify` must be a concrete command but remains a recipe until the parent actually runs it.

Run the bundled validator and repair duplicate IDs, unknown references, cycles, unsafe paths, missing coverage, and parallel file overlap.
