---
name: video-shot-recipes
description: Select and stage attributed, offline shot recipes for an evidence-bound Remotion storyboard. Use for product promos or when a video beat needs a concrete camera, transition, UI entrance, kinetic-type, data-visualization, or motion recipe; do not use for audio generation or claims that a recipe alone proves final visual fidelity.
---

# Video Shot Recipes

Use the bundled catalog as a planning and implementation reference. It is pinned to one upstream revision, works offline, and does not imply that a copied source automatically fits the project or passes review.

## Workflow

1. Search by narrative job, moving object, state change, energy, or category:

   `node <plugin-root>/dist/cli/shot-catalog.mjs search <query>`

2. Inspect an exact recipe and style:

   `node <plugin-root>/dist/cli/shot-catalog.mjs show <recipe-id> <style-id>`

3. Choose only an `executable` style for `direct` or `adapted` use. A `reference-only` style may be recorded only as `inspired` and must be implemented independently.
4. Stage the immutable recipe and source closure with one exact host Tool command:

   `node <plugin-root>/dist/cli/project-shot-stage.mjs <project-root> <beat-id> <recipe-id> <style-id>`

5. Adapt staged code into a project-owned `src/visual/` unit. Update `implementationPath`, `adaptationNotes`, `usage`, and at least two bounded `reviewFrames` in `plan.shots.json`.
6. Re-approve the storyboard digest after the shot plan is final. Run lint, render, probe, independent review, and release normally.

For every storyboard beat in a required shot plan, record exactly one catalog selection or a custom beat with a concrete reason. Keep the catalog revision unchanged. The probe binds decoded review frames to current implementation bytes; the independent reviewer must pass `shotFidelity`. Never claim perceptual equivalence from catalog lookup, staging, compilation, or hook activation alone.
