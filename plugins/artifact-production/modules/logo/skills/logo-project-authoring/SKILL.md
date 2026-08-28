---
name: logo-project-authoring
description: Orchestrate a native-vector logo project through concepts, construction proof, variants, preview, independent review, and release.
---

# Logo Project Authoring

Keep the main agent responsible for user intent, source integration, gate decisions, and final reporting. Read [Project contract](references/project-contract.md) and [Skill composition](references/skill-composition.md) before authoring.

Use the complete chain `brief → context/references → concept → master → construction → variants → preview → review → release`, while allowing feedback to return from concept selection or preview to the preceding source stage.

1. Freeze `plan.brief.json`, `plan.context.json`, `plan.contract.json`, `plan.color-system.json`, parsed asset/reference provenance, delivery profile, Figma capability/fallback, and the dynamic role-based bilingual worker selection. The brief binds exact `brandName` and `wordmarkText`, script/case policy, and the letterform type class, stroke profile, structure, edge finish, and scene reference. The color system binds its stable core, tokens, structural roles, scenarios, contrast pairs, and prohibited combinations.
2. Use at most three bundled companion Skills. They have no project writer, review, or release authority. Admit each used Result Card with `project-advice.mjs`; integrate or reject its recommendations explicitly. Never substitute a similarly named Skill exposed by the runtime.
3. Create at least six genuinely different black-and-white source concepts across symbolic, typographic, monogram, negative-space, geometric, and narrative buckets. Record at least two feedback/selection rounds, select exactly one, and derive custom Mark, Wordmark, and Lockup masters from it. Bind the exact wordmark copy to unique current SVG path ids in `src/master/wordmark.manifest.json`.
4. Bind the standard grid, geometry primitives, optical corrections, and method-appropriate construction sheets to current master hashes. **Fibonacci is optional**: use and prove it only when the selected form was actually built from Fibonacci relationships.
5. Define primary, mono, reverse, and secondary-layout variants plus transparent PNG, favicon/app icon, specimen, application mockup, and print-guidance outputs. After `package.json` is final, run `project-lock.mjs <project-root>`; it generates `package-lock.json` with lifecycle scripts disabled and rejects unrelated project writes. Do not run npm directly inside Logo scope. Run `project-lint.mjs`, then `project-render.mjs` for render-owned outputs only. Use authenticated Figma writeback only when declared; otherwise use the `svg-import-package` Figma fallback.
6. Run `project-preview.mjs`. It creates the strip and measured squint evidence but never edits review data.
7. Hand current hashes and final artifacts to a different session using `$logo-project-review`. That reviewer writes an external input and invokes `project-review.mjs`.
8. Run `project-release.mjs` only after admitted review. It alone writes `release.manifest.json` and `receipt.release.json`.

After source changes, rerun from render. After master changes, rerun construction, variants, preview, and review. After only review-input correction, rerun review. Retry a transient adviser once; never bypass a missing core gate.
