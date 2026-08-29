---
name: diagram-project-review
description: Independently inspect current diagram SVG and PNG outputs and submit a digest-bound review through the registered review writer. Use only when another session produced a diagram project and requests release review; do not use while authoring or rendering that project.
---

# Diagram Project Review

Do not edit project files, regenerate outputs, accept stale digests, or release the project. Inspect the current SVG and PNG at full size and thumbnail size; compare imported semantics with `plan.import-ledger.json` when present.

Create `diagram-production/review-input/v1` JSON outside the project. Bind the artifact id, current subject digest, your independent session id, overall `pass` verdict, findings, and these checks: `hierarchy`, `routing`, `labels`, `accessibility`, and `fidelity`. Each check needs `status`, exact `anchor`, concrete `evidence`, and a verifiable `recovery`. Findings need severity and disposition; high or critical findings cannot be accepted.

Invoke `node ${PLUGIN_ROOT}/dist/cli/harness.mjs diagram review <project-root> <external-input>` from this independent session. Return the admitted result and actionable findings only.
