import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "poster-project-authoring",
  fullName: "Poster Project Authoring",
  description: "Orchestrate a deterministic poster project from brief through art direction, Satori source, SVG/PNG render, evidence, independent review, and release.",
  useCases: [
    "Orchestrate a deterministic poster project from brief through art direction, Satori source, SVG/PNG render, evidence, independent review, and release.",
  ],
  constraints: [
    "do not fetch, write, spawn, use nondeterminism, assign z-index, or import sibling layers.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Poster Project Authoring\n\nCreate an original SVG/PNG poster whose brief, assets, source, outputs, evidence, and review remain reproducibly bound. The main agent owns user intent, project files, advisor integration, gate decisions, and final reporting.\n\n## Required references\n\nRead all of these before authoring:\n\n- [Project contract](references/project-contract.md)\n- [Profiles](references/profiles.md)\n- [Skill composition](references/skill-composition.md)\n- [Design system](references/design-system.md)\n- [Quality gates](references/quality-gates.md)\n- [Assets and accessibility](references/assets-accessibility.md)\n\n## Workflow\n\n1. Select exactly one profile and a lowercase kebab-case artifact id. Run registered `node ${PLUGIN_ROOT}/dist/cli/harness.mjs poster init <root> --profile <profile>`.\n2. Replace the scaffold brief with the user-approved audience, objective, language, assumptions, and terminal `targetStage` (normally `release`) in `plan.contract.json`; freeze the matching direction in `plan.art-direction.json`. Its communication core names the intent, audience outcome, exact retell target, one semantically causal signature cue anchored to a real layer id, invariants, and prohibited drift. Record every current-source advisor as `used`, `skipped`, or `unavailable`.\n3. Treat advisors as read-only. Integrate their useful advice into project-owned JSON or TSX; never run their scripts or accept their outputs as evidence, review, or release authority.\n4. Register all user, generated, licensed, and public-domain assets in `plan.assets.json` before use. AI imagery is an input asset, never the complete deliverable.\n5. Freeze `design.system.json`, exact copy in `data/<variant>.json`, variant order, dimensions, safe area, typography roles, color roles, and contrast pairs. Keep the signature cue recognizable at full size and thumbnail size; visual repetition alone does not establish semantic continuity.\n6. Implement isolated `buildLayer` modules. Layers do not fetch, write, spawn, use nondeterminism, assign z-index, or import sibling layers.\n7. Run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs poster lint`, then the registered `node ${PLUGIN_ROOT}/dist/cli/harness.mjs poster render`. The render writer generates self-contained SVG and rasterizes it deterministically to PNG.\n8. Run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs poster probe`. Resolve SVG safety, byte-equivalence, dimension, blank-output, typography-minimum, contrast, and accessibility failures by changing inputs, then repeat lint → render → probe.\n9. Provide only the project root, current PNGs and digests, and the review-input contract to an independent `$poster-project-review` session. The reviewer creates its input outside the project and invokes `node ${PLUGIN_ROOT}/dist/cli/harness.mjs poster review` itself.\n10. After an admitted `review.poster.json`, run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs poster release`. Report only `release.manifest.json` outputs and label verification claims with provenance.\n\nUse each wrapper as a standalone exact command. Generated paths are protected; mutating wrappers consume a short-lived session-, argv-, and subject-bound capability. Allow at most two producer/reviewer rounds. After a source, asset, copy, design, or dimension change, restart at lint.\n\nDo not imitate a named living artist. Translate references into general composition, material, color, typography, and narrative principles and require original subject-specific relationships.\n",
  }),
  codexInterface: {
    shortDescription: "Orchestrate deterministic SVG/PNG poster delivery",
    defaultPrompt: "Create a new poster project with $poster-project-authoring and carry it through independent review and release.",
  },
  sourceDir: new URL("./", import.meta.url),
});
