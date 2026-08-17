---
name: poster-project-review
description: Independently review current deterministic poster PNG variants and submit a digest-bound review through the registered poster review writer. Use only when another session produced a poster project and explicitly requests independent release review; do not use while authoring or rendering the same project.
---

# Poster Project Review

Read [Review contract](references/review-contract.md). Inspect every current PNG at full size and thumbnail size. Do not edit project files, regenerate artwork, accept stale digests, or release the project.

Create `poster-production/review-input/v3` JSON outside the project. Bind the current artifact id, subject digest, every variant id and PNG digest, your own session id, structured checks, findings, and verdict. Every check and finding has an exact visual anchor, concrete evidence, and recovery path.

All required checks must pass. Unresolved findings are not hidden or downgraded. Invoke `project-review.mjs <project-root> <external-input>` yourself in this independent session, then return only the admitted review result and actionable findings.
