---
name: logo-project-authoring
description: Orchestrate a reproducible native-vector logo project from a decision-complete brief through concepts, master roles, construction proof, variants, rendered preview, independent review, and release receipt under artifacts/logo. Use for end-to-end logo delivery; do not use for a quick standalone icon, general VI system, or review-only request.
---

# Logo Project Authoring

Keep the main agent responsible for user intent, source integration, gate decisions, and final reporting. Read [Project contract](references/project-contract.md) and [Skill composition](references/skill-composition.md) before authoring.

Follow exactly: `brief → concept → master → construction → variants → preview → review → release`.

1. Freeze `plan.brief.json`, `plan.contract.json`, asset provenance, and the dynamic bilingual worker selection.
2. Use at most three bundled companions. External Skills have no project writer, review, or release authority. Admit each used Result Card with `project-advice.mjs`; integrate or reject its recommendations explicitly.
3. Create multiple source concepts, select exactly one, and derive the Mark, Wordmark, and Lockup masters from it.
4. Bind the standard grid, geometry primitives, Fibonacci construction, and construction sheets to current master hashes.
5. Define primary, mono, and reverse variants. Run `project-lint.mjs`, then `project-render.mjs` for render-owned outputs only.
6. Run `project-preview.mjs`. It creates the strip and measured squint evidence but never edits review data.
7. Hand current hashes and final artifacts to a different session using `$logo-project-review`. That reviewer writes an external input and invokes `project-review.mjs`.
8. Run `project-release.mjs` only after admitted review. It alone writes `release.manifest.json` and `receipt.release.json`.

After source changes, rerun from render. After master changes, rerun construction, variants, preview, and review. After only review-input correction, rerun review. Retry a transient adviser once; never bypass a missing core gate.
