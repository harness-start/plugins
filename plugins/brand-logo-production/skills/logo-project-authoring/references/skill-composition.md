# Skill composition

Select dynamically by needed role from the bundled bilingual pool. Do not require every candidate and use at most three workers with distinct advice artifacts.

| Worker | Role | Mode | Contribution |
|---|---|---|---|
| `logo-brand-direction` | brand-direction | adviser | brief, context, and initial visual direction |
| `logo-form-language` | vector-production | reference-only | six concept mechanisms, custom form, variants, and small-size checks |
| `logo-color-accessibility` | color-accessibility | reference-only | mono/reverse, gamut, contrast, and print color risk |
| `logo-presentation-system` | presentation | reference-only | specimen/mockup, export profile, print notes, and Figma fallback |

For a used worker, create its Result Card outside the project and admit it with `project-advice.mjs <project-root> <external-json>`. Never execute a reference-only dependency or read files outside its allowlist. Retry a transient unavailable worker once; otherwise mark it unavailable and continue only when its phase is non-critical.

Use this external Result Card shape, replacing placeholders with current values:

```json
{
  "schema": "brand-logo-production/skill-advice-input/v1",
  "artifactId": "<artifact-id>",
  "subjectDigest": "<current-subject-sha256>",
  "skillName": "<selected-worker>",
  "ecosystem": "bilingual",
  "mode": "reference-only",
  "phase": "concept",
  "summary": "<bounded contribution>",
  "recommendations": ["<recommendation>"],
  "adopted": ["<adopted recommendation and rationale>"],
  "rejected": ["<rejected recommendation and rationale>"]
}
```

`ecosystem`, `mode`, and `phase` must match the selected bundled registry row; `logo-brand-direction` uses mode `adviser`. Regenerate the card whenever the subject digest changes.
