# Skill composition

Select dynamically from the bilingual public pool; do not force one worker from each ecosystem. Use at most three workers with distinct advice artifacts.

| Worker | Revision | Mode | Contribution |
|---|---|---|---|
| `brand-identity` | `4a0a8b5b7a0f64bf0fc551978a18a591670a5223` | adviser | brief and initial visual direction |
| `logo-design` | `75865a5d037a4cdaa7f409a4ec14ab9b0292920b` | reference-only | concept diversity, master refinement, variants, and small-size preview checks |
| `color-expert` | `6aa1d1315dddd93be74a9481d62712291059253e` | reference-only | color space, gamut, contrast, and accessibility |
| `logo-generator` | `bf4e9ac4d4428bda261afcfe981871ceb92d94e6` | reference-only | Chinese-ecosystem pattern diversity, restrained geometric concepts, and small-size preview critique |

For a used worker, create its Result Card outside the project and admit it with `project-advice.mjs <project-root> <external-json>`. Never execute a reference-only dependency or read files outside its allowlist. Retry a transient unavailable worker once; otherwise mark it unavailable and continue only when its phase is non-critical.

Use this external Result Card shape, replacing placeholders with current values:

```json
{
  "schema": "logo-project-delivery-guard/skill-advice-input/v1",
  "artifactId": "<artifact-id>",
  "subjectDigest": "<current-subject-sha256>",
  "skillName": "<selected-worker>",
  "revision": "<pinned-revision>",
  "ecosystem": "en",
  "mode": "reference-only",
  "phase": "concept",
  "summary": "<bounded contribution>",
  "recommendations": ["<recommendation>"],
  "adopted": ["<adopted recommendation and rationale>"],
  "rejected": ["<rejected recommendation and rationale>"]
}
```

`ecosystem`, `mode`, and `phase` must match the selected row in `plan.skill-composition.json`; `brand-identity` uses mode `adviser`. Regenerate the card whenever the subject digest changes.
