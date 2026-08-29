---
name: poster-project-review
description: Independently review current poster PNG variants and submit a digest-bound verdict through the registered review writer.
---

# Poster Project Review

Inspect every current PNG at full size and thumbnail size before reading the art-direction contract. Record the dominant cue and a one-sentence pre-contract retell. Then read [Review contract](references/review-contract.md) and compare that blind read with the communication core. Do not edit project files, regenerate artwork, accept stale digests, or release the project.

Create `poster-production/review-input/v4` JSON outside the project. Bind the current artifact id, subject digest, every variant id and PNG digest, your own session id, structured checks, findings, `reviewerRetell`, `communicationReview`, and verdict. Every check and finding has an exact visual anchor, concrete evidence, and recovery path.

All required checks must pass. Unresolved findings are not hidden or downgraded. Invoke `node ${PLUGIN_ROOT}/dist/cli/harness.mjs poster review <project-root> <external-input>` yourself in this independent session, then return only the admitted review result and actionable findings.
