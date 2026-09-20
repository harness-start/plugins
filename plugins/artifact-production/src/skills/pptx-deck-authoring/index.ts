import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "pptx-deck-authoring",
  fullName: "PPTX Deck Authoring",
  description: "Orchestrate a new, editable 16:9 PPTX project from requirements through storyboard, design system, PptxGenJS source, rendering, evidence probes, independent review, PDF export, and release receipt. Use for creating a presentation from scratch under artifacts/pptx; do not use for editing an existing PPTX or template.",
  useCases: [
    "Use for creating a presentation from scratch under artifacts/pptx; do not use for editing an existing PPTX or template.",
    "Before initialization, use $artifact-creative-direction only for requested alternatives or repetitive concepts; treat it as advice, not evidence, and fold the choice into the same existing brief.",
  ],
  constraints: [
    "do not use for editing an existing PPTX or template.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# PPTX Deck Authoring\n\nCreate an original, editable deck whose source, outputs, evidence, and review remain reproducibly bound. Keep the main agent responsible for user intent, source integration, gate decisions, and final reporting.\n\n## Required references\n\nRead all of these before authoring:\n\n- [Project contract](references/project-contract.md)\n- [Skill composition](references/skill-composition.md)\n- [Design system](references/design-system.md)\n- [Quality gates](references/quality-gates.md)\n- [Accessibility](references/accessibility.md)\n\n## Workflow\n\n1. Choose a lowercase kebab-case artifact id. Run the registered `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation init` wrapper for `artifacts/pptx/<artifact-id>`.\n2. Replace every scaffold placeholder. Freeze `plan.contract.json`, `plan.storyboard.json`, and `plan.skill-composition.json` before slide source work. The plan communication core names the intent, audience outcome, exact retell target, one semantically causal signature cue anchored to a real `slide:<id>`, invariants, and prohibited drift. Every slide states one assertion, narrative job, transition, and contribution to that core.\n3. Acquire optional external workers only for their declared phase. Record each current-source worker's `used`, `skipped`, or `unavailable` status. Treat their output as advice; integrate it into project-owned JSON or TypeScript yourself.\n4. Freeze `design.system.json`. Make color, typography, spacing, chart, and accessibility decisions semantic and measurable.\n5. Implement `src/deck.ts`, `src/theme.ts`, and exactly one `src/slides/NNN-slug.ts` module per manifest slide. A slide module modifies only the supplied slide and does not create slides, write files, fetch, spawn, or use nondeterminism.\n6. Run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation lint`. Resolve every source-contract or ESLint finding.\n7. Run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation render`. This is the only writer for PPTX, PDF, page PNGs, source-hash previews, and render evidence.\n8. Run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation probe`. Resolve structure, page mapping, design measurement, and accessibility findings by changing source, then repeat lint → render → probe.\n9. Hand only the project root, final page PNGs, current digest data, registered review command, and external review-input contract to an independent reviewer using `$pptx-deck-review`. The reviewer must create the input and invoke `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation review` in its own session, which must differ from the rendering and release sessions.\n10. After the reviewer returns an admitted `review.pptx.json`, run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation release <project-root>`.\n11. Report only the files listed by `release.manifest.json`. Label each verification claim with its execution provenance.\n\nUse exact standalone wrapper commands. Do not chain them with redirects, pipes, shell substitutions, or a second command. Generated paths are protected by the hook and each mutating wrapper consumes a short-lived, argv- and source-bound capability.\n\n## Failure and rerun policy\n\n- Retry a transient external worker or tool once. Record `unavailable` and continue only when that worker is optional.\n- Stop on missing core toolchain, invalid source contract, unresolved OOXML relation, page-count mismatch, accessibility failure, self-review, or stale hashes.\n- After any source or design change, restart at lint. After only a review-input correction, restart at review. Release never repairs upstream artifacts.\n- Allow at most two producer/reviewer rounds. If major findings remain, return to storyboard or design rather than accepting them silently.\n\nUse only the Skills and references bundled with this plugin. A similarly named presentation Skill exposed by the runtime is neither a dependency nor an allowed design-reference substitute.\n",
  }),
  codexInterface: {
    shortDescription: "Orchestrate editable PPTX delivery with evidence gates",
    defaultPrompt: "Use $pptx-deck-authoring to create and verify an editable PPTX project.",
  },
  sourceDir: new URL("./", import.meta.url),
});
