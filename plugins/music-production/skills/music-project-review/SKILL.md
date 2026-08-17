---
name: music-project-review
description: Independently review a current Music Project Delivery Guard mix and every stem, record digest-bound findings, and submit a controlled approval or changes-requested decision.
---

# Music Project Review

Use this skill in a session that did not create the current render. It is a reviewer, not a producer.

## Authority boundary

- Read `plan.brief.json`, `plan.direction.json`, `plan.arrangement.json`, the symbolic score, render receipt, preview evidence, current mix, every proof stem, and the current anonymous reference profile when source analysis was used.
- You may consult the installed current-source `workflow-analysis-quality` reference. Do not execute its scripts or commands.
- Do not edit plans, composition or instrument sources, generated audio, preview evidence, release manifests, or receipts.
- Do not call `project-release.mjs`. Return requested changes to `$music-project-authoring`.
- Write the review payload outside the project root, then submit it only through `project-review.mjs`.

## Review gate

Audition the exact digest-bound mix and every stem. Cover brief alignment, melodic and harmonic coherence, rhythm and groove, form and arrangement, timbre and orchestration, balance/space/dynamics, and technical integrity. For a source-analysis brief, also compare the audible result with the anonymous profile under `reference-profile-alignment`; do not recover artist identities or rerun `music-reference-profile`. Every finding needs a stable id, severity, exact evidence path and SHA-256, a verifiable fix, status, and recheck evidence for blocker or major findings that are marked verified.

Use `changes_requested` while any blocker or major finding remains open. Use `approved` only when the current artifacts meet the brief and all required checks pass. The writer binds your decision to the current subject, mix, stems, preview, session, and payload digest.

Prepare this payload outside the project root. `coverage` must follow the writer's expected order: score, metrics, render receipt, mix, stems in track order, then preview evidence. Supply all seven check ids named above in kebab case.

```json
{
  "schema": "music-production/review-input/v2",
  "artifactId": "<id>",
  "subjectDigest": "<64-hex>",
  "mixSha256": "<64-hex>",
  "decision": "approved",
  "reviewer": {
    "kind": "independent-agent",
    "id": "<reviewer-id>",
    "sessionId": "<current-independent-session>"
  },
  "coverage": [{ "path": "<artifact-path>", "sha256": "<64-hex>" }],
  "checks": [{ "id": "brief-alignment", "status": "pass", "note": "<audible evidence>" }],
  "findings": []
}
```

Legacy `brief/v1` projects continue to use `review-input/v1`. Current `brief/v2` projects use v2, and source-analysis coverage appends `evidence/reference-profile.<briefSha256>.json` after preview evidence.

Submit it with `node "${PLUGIN_ROOT}/dist/cli/project-review.mjs" "artifacts/music/<id>" "/absolute/path/to/review-input.json"`.
