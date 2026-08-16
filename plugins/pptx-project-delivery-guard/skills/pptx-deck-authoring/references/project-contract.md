# Project contract

The project root is `artifacts/pptx/<artifact-id>`. Versioned source includes `.gitignore`, package files, `plan.contract.json`, `plan.storyboard.json`, `plan.skill-composition.json`, `design.system.json`, `pptx.project.json`, `src/deck.ts`, `src/theme.ts`, and `src/slides/manifest.json`.

Stages are strictly ordered: `source → design → render → probe → review → release`. Set `plan.contract.json.targetStage` to the stage actually required at session stop. Never spell or invent stages loosely.

Only create decks from scratch in v1. Do not edit, restyle, or import an existing `.pptx` or template. Deliver the editable `.pptx`, same-source `.pdf`, one PNG per page, source-hash previews, evidence JSON, independent review, manifest, and receipt.

Source paths remain agent-editable. These generated paths are wrapper-owned: `dist/**`, `src/slides/*.png`, `evidence.*.json`, `review.*.json`, `release.manifest.json`, `receipt.*.json`, and the mutation journal. Do not bypass the hook with direct shell, filesystem APIs, scripts, symlinks, or encoded commands.

Every slide manifest entry is contiguous and maps to `src/slides/NNN-slug.ts`. Slide modules export exactly one `renderSlide`; `src/deck.ts` alone creates slides and writes the final PPTX.
