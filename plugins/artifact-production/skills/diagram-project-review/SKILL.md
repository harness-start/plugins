---
name: diagram-project-review
description: Independently inspect current diagram SVG and PNG outputs and submit a digest-bound review through the registered review writer. Use only when another session produced a diagram project and requests release review; do not use while authoring or rendering that project.
---

# Diagram Project Review

Do not edit project files, regenerate outputs, accept stale digests, or release the project. Inspect the current SVG and PNG at full size and thumbnail size before reading the plan; record the first relationship you notice and a one-sentence pre-contract retell. Then read the communication core and compare imported semantics with `plan.import-ledger.json` when present.

Create `diagram-production/review-input/v2` JSON outside the project. Bind the artifact id, current subject digest, your independent session id, overall `pass` verdict, findings, and these checks: `hierarchy`, `routing`, `labels`, `accessibility`, and `fidelity`. Also provide `reviewerRetell` and passing `coreFidelity`, `signatureCue`, `semanticCausality`, `retellAlignment`, and `invariantContinuity` objects under `communicationReview`. Each communication check uses one of the frozen signature-cue anchors and needs `status`, concrete `evidence`, and a verifiable `recovery`. Findings need severity and disposition; high or critical findings cannot be accepted.

Invoke `node ${PLUGIN_ROOT}/dist/cli/harness.mjs diagram review <project-root> <external-input>` from this independent session. Return the admitted result and actionable findings only.
