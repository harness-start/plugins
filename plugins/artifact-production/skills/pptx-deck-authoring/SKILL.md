---
name: pptx-deck-authoring
description: "Orchestrate a new, editable 16:9 PPTX v5 project from requirements through storyboard, deterministic text layout, PptxGenJS source, topology and OOXML probes, independent review, PDF export, and release receipt. Use for creating a presentation from scratch under artifacts/pptx; do not use for editing an existing PPTX or template."
---

# PPTX Deck Authoring

## When to use

- Use for creating a presentation from scratch under artifacts/pptx; do not use for editing an existing PPTX or template.
- Before initialization, use $artifact-creative-direction only for requested alternatives or repetitive concepts; treat it as advice, not evidence, and fold the choice into the same existing brief.

## Constraints

- Do not use for editing an existing PPTX or template.

Create an original, editable v5 deck whose source, outputs, evidence, and review remain reproducibly bound. Keep the main agent responsible for user intent, source integration, gate decisions, and final reporting.

## Required references

Read all of these before authoring:

- [Project contract](references/project-contract.md)
- [Skill composition](references/skill-composition.md)
- [Design system](references/design-system.md)
- [Quality gates](references/quality-gates.md)
- [Accessibility](references/accessibility.md)

Read [v4 to v5 migration](references/migration-v4.md) only when an older presentation-production source project must be diagnosed. The authoring workflow does not convert or edit an existing PPTX.

## Workflow

1. Choose a lowercase kebab-case artifact id. Run the registered `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation init` wrapper for `artifacts/pptx/<artifact-id>`.
2. Replace every scaffold placeholder. Freeze the v5 `plan.contract.json`, `plan.storyboard.json`, and `plan.skill-composition.json` before slide source work. Keep the audience brief private by default with `audience.addressing: "implicit"`; explicit audience naming requires a rationale. Every slide separates its one-line `displayTitle` and headline mode from its internal `assertion`, narrative job, transition, and contribution to the communication core. Read the whole title chain aloud and remove repeated slogan frames even when every title is short.
3. Acquire optional external workers only for their declared phase. Record each current-source worker's `used`, `skipped`, or `unavailable` status. Treat their output as advice; integrate it into project-owned JSON or TypeScript yourself.
4. Freeze `design.system.json`. Make color, typography, spacing, chart, accessibility, and anti-pattern decisions semantic and measurable. Typography roles include paragraph spacing, alignment, vertical anchoring, and margins; body and list text stay left/top aligned.
5. Implement `src/deck.ts`, `src/theme.ts`, `src/semantic-layout.ts`, `src/text-layout.ts`, and exactly one `src/slides/NNN-slug.ts` module per manifest slide. Use `addTextBlock`, `addBulletList`, `addNumberedList`, and `addAlignedStack` rather than ad hoc text boxes. Use `paraSpaceAfter`, never the nonexistent `paraSpaceAfterPt`, and never use `fit: "shrink"` or `"resize"`; size the box and copy deliberately. Keep the scaffolded semantic object names so the OOXML probe can bind every text role, group, node, edge, and break marker. A slide module modifies only the supplied slide and does not create slides, write files, fetch, spawn, or use nondeterminism.
6. For diagrams, make the declared topology visible. Forward edges follow `readingDirection`; a cycle contains a return edge; a branch visibly forks or merges. Prefer left-to-right sequence and branch flows on 16:9, and record a rationale before using a vertical reading path.
7. Run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation lint`. Resolve every source-contract, project-local TypeScript, or ESLint finding.
8. Run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation render`. This is the only writer for PPTX, PDF, page PNGs, source-hash previews, and render evidence.
9. Run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation probe`. Resolve title identity, emitted line and paragraph spacing, autofit, grouping, topology, physical arrow direction, structure, page mapping, composition signals, and accessibility findings by changing source, then repeat lint → render → probe. Headline and composition signals require reviewer disposition; they are not automatic aesthetic verdicts.
10. Hand only the project root, final page PNGs, current digest data, registered review command, and external review-input contract to an independent reviewer using `$pptx-deck-review`. The reviewer must create the input and invoke `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation review` in its own session, which must differ from the rendering and release sessions.
11. After the reviewer returns an admitted `review.pptx.json`, run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation release <project-root>`.
12. Report only the files listed by `release.manifest.json`. Label each verification claim with its execution provenance.

Use exact standalone wrapper commands. Do not chain them with redirects, pipes, shell substitutions, or a second command. Generated paths are protected by the hook and each mutating wrapper consumes a short-lived, argv- and source-bound capability.

## Failure and rerun policy

- Retry a transient external worker or tool once. Record `unavailable` and continue only when that worker is optional.
- Stop on a legacy schema, long or unnamed title, invalid native relation, unresolved OOXML relationship, page-count mismatch, accessibility failure, incomplete quality review, self-review, or stale hashes.
- After any source or design change, restart at lint. After only a review-input correction, restart at review. Release never repairs upstream artifacts.
- Allow at most two producer/reviewer rounds. If high or critical findings remain, return to storyboard or design; they cannot be accepted for release.

Use only the Skills and references bundled with this plugin. A similarly named presentation Skill exposed by the runtime is neither a dependency nor an allowed design-reference substitute.

## References

- [accessibility.md](references/accessibility.md)
- [design-system.md](references/design-system.md)
- [migration-v4.md](references/migration-v4.md)
- [project-contract.md](references/project-contract.md)
- [quality-gates.md](references/quality-gates.md)
- [skill-composition.md](references/skill-composition.md)
