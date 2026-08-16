# Skill composition

Select dynamically from the bilingual public pool; do not force one worker from each ecosystem. Use at most three workers with distinct advice artifacts.

| Worker | Source policy | Mode | Contribution |
|---|---|---|---|
| `brand-identity` | current upstream | adviser | brief and initial visual direction |
| `logo-design` | current upstream | reference-only | concept diversity, master refinement, variants, and small-size preview checks |
| `color-expert` | current upstream | reference-only | color space, gamut, contrast, and accessibility |
| `logo-generator` | current upstream | reference-only | Chinese-ecosystem pattern diversity, restrained geometric concepts, and small-size preview critique |

For a used worker, create its Result Card outside the project and admit it with `project-advice.mjs <project-root> <external-json>`. Never execute a reference-only dependency or read files outside its allowlist. Retry a transient unavailable worker once; otherwise mark it unavailable and continue only when its phase is non-critical.

Use this external Result Card shape, replacing placeholders with current values:

```json
{
  "schema": "brand-logo-production/skill-advice-input/v1",
  "artifactId": "<artifact-id>",
  "subjectDigest": "<current-subject-sha256>",
  "skillName": "<selected-worker>",
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
