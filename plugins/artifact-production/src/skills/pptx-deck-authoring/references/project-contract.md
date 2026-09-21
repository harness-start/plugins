# Project contract

The project root is `artifacts/pptx/<artifact-id>`. Versioned source includes `.gitignore`, package files, the v4 plan, storyboard, skill-composition, design-system, project, and slide-manifest contracts, plus `src/deck.ts`, `src/theme.ts`, `src/semantic-layout.ts`, and one source module per slide. Earlier schema versions are rejected rather than upgraded in place.

Stages are strictly ordered: `source → design → render → probe → review → release`. Set `plan.contract.json.targetStage` to the stage actually required at session stop. Never spell or invent stages loosely.

Only create decks from scratch. Do not edit, restyle, or import an existing `.pptx` or template. Deliver the editable `.pptx`, same-source `.pdf`, one PNG per page, source-hash previews, evidence JSON, independent review, manifest, and receipt.

The audience brief is structured and private by default. `audience.addressing: "explicit"` requires a rationale. Every page has a single-line `displayTitle` of at most 20 display-width units and a separate internal `assertion`. The manifest preserves the storyboard id, display title, and visual declaration.

Source paths remain agent-editable. These generated paths are wrapper-owned: `dist/**`, `src/slides/*.png`, `evidence.*.json`, `review.*.json`, `release.manifest.json`, `receipt.*.json`, and the mutation journal. Do not bypass the hook with direct shell, filesystem APIs, scripts, symlinks, or encoded commands.

Every slide manifest entry is contiguous and maps to `src/slides/NNN-slug.ts`. Slide modules export exactly one `renderSlide`; `src/deck.ts` alone creates slides and writes the final PPTX. Visible titles and native diagram objects use the `pptx:*` object names documented by the scaffold so the final package can be checked rather than trusted from source declarations.
