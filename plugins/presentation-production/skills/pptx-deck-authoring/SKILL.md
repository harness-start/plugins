---
name: pptx-deck-authoring
description: Orchestrate a new, editable 16:9 PPTX project from requirements through storyboard, design system, PptxGenJS source, rendering, evidence probes, independent review, PDF export, and release receipt. Use for creating a presentation from scratch under artifacts/pptx; do not use for editing an existing PPTX or template.
---

# PPTX Deck Authoring

Create an original, editable deck whose source, outputs, evidence, and review remain reproducibly bound. Keep the main agent responsible for user intent, source integration, gate decisions, and final reporting.

## Required references

Read all of these before authoring:

- [Project contract](references/project-contract.md)
- [Skill composition](references/skill-composition.md)
- [Design system](references/design-system.md)
- [Quality gates](references/quality-gates.md)
- [Accessibility](references/accessibility.md)

## Workflow

1. Choose a lowercase kebab-case artifact id. Run the registered `project-init.mjs` wrapper for `artifacts/pptx/<artifact-id>`.
2. Replace every scaffold placeholder. Freeze `plan.contract.json`, `plan.storyboard.json`, and `plan.skill-composition.json` before slide source work.
3. Acquire optional external workers only for their declared phase. Record each current-source worker's `used`, `skipped`, or `unavailable` status. Treat their output as advice; integrate it into project-owned JSON or TypeScript yourself.
4. Freeze `design.system.json`. Make color, typography, spacing, chart, and accessibility decisions semantic and measurable.
5. Implement `src/deck.ts`, `src/theme.ts`, and exactly one `src/slides/NNN-slug.ts` module per manifest slide. A slide module modifies only the supplied slide and does not create slides, write files, fetch, spawn, or use nondeterminism.
6. Run `project-lint.mjs`. Resolve every source-contract or ESLint finding.
7. Run `project-render.mjs`. This is the only writer for PPTX, PDF, page PNGs, source-hash previews, and render evidence.
8. Run `project-probe.mjs`. Resolve structure, page mapping, design measurement, and accessibility findings by changing source, then repeat lint → render → probe.
9. Hand only the project root, final page PNGs, current digest data, registered review command, and external review-input contract to an independent reviewer using `$pptx-deck-review`. The reviewer must create the input and invoke `project-review.mjs` in its own session, which must differ from the rendering and release sessions.
10. After the reviewer returns an admitted `review.pptx.json`, run `project-release.mjs <project-root>`.
11. Report only the files listed by `release.manifest.json`. Label each verification claim with its execution provenance.

Use exact standalone wrapper commands. Do not chain them with redirects, pipes, shell substitutions, or a second command. Generated paths are protected by the hook and each mutating wrapper consumes a short-lived, argv- and source-bound capability.

## Failure and rerun policy

- Retry a transient external worker or tool once. Record `unavailable` and continue only when that worker is optional.
- Stop on missing core toolchain, invalid source contract, unresolved OOXML relation, page-count mismatch, accessibility failure, self-review, or stale hashes.
- After any source or design change, restart at lint. After only a review-input correction, restart at review. Release never repairs upstream artifacts.
- Allow at most two producer/reviewer rounds. If major findings remain, return to storyboard or design rather than accepting them silently.

Never copy the proprietary Anthropic presentation Skill into this plugin or claim it as a dependency. It may be consulted separately as a design reference only when the runtime lawfully provides it.
