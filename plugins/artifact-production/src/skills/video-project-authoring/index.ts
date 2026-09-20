import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "video-project-authoring",
  fullName: "Video Project Authoring",
  description: "Orchestrate an evidence-bound Remotion video from direction and storyboard through media admission, rendering, probes, independent review, and release.",
  useCases: [
    "Orchestrate an evidence-bound Remotion video from direction and storyboard through media admission, rendering, probes, independent review, and release.",
  ],
  constraints: [
    "do not treat a candidate as an automatic failure or silently waive it.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Video Project Authoring\n\nCreate an original video whose intent, script, assets, source, media outputs, measurements, review, and release stay digest-bound. The main agent owns project files, advisor integration, approvals, and final reporting.\n\n## Required references\n\nRead all of these before authoring:\n\n- [Project contract](references/project-contract.md)\n- [Profiles](references/profiles.md)\n- [Skill composition](references/skill-composition.md)\n- [Direction and design](references/direction-and-design.md)\n- [External media admission](references/external-media-admission.md)\n- [Quality gates](references/quality-gates.md)\n\n## Workflow\n\n1. Select one profile, `guided` or `autonomous` mode, and a kebab-case artifact id. Run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs video init <root> --profile <profile> --mode <mode>`.\n2. Replace scaffold assumptions and freeze the direction, script, storyboard, design system, Skill composition, references, budget, and approval records before composition work. The direction communication core names the intent, audience outcome, exact retell target, one semantically causal signature cue anchored to a real `beat:<id>`, invariants, and prohibited drift. Every storyboard beat states how its visible state change contributes to that core.\n3. For `product-promo`, invoke `$video-shot-recipes`, cover every storyboard beat in `plan.shots.json`, and stage selected snapshots before implementing them. For other profiles, use shot planning when its causal value is clear.\n4. Treat advisors as read-only. Record each current-source worker's `used`, `skipped`, or `unavailable` status. Integrate advice into project-owned JSON and TypeScript yourself.\n5. Run external media generators or editors only outside the artifact root. Never expose credentials in commands or project files. Admit declared outputs with `node ${PLUGIN_ROOT}/dist/cli/harness.mjs video admit <root> <external-run-manifest>`.\n6. Implement visual units and audio/caption bindings whose half-open frame ranges project exactly from the storyboard. Keep each visual unit free of global scheduling, audio ownership, I/O, network, and wall-clock randomness.\n7. Run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs video lint`, render every visual and audio unit, then render final. After a source, asset, direction, script, design, timing, or shot-selection change, restart at lint.\n8. Run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs video probe`. Resolve media, timing, audio, caption, motion, shot, signature-cue continuity, and conditional reference findings before review. Pass every reported near-black candidate to the independent reviewer; do not treat a candidate as an automatic failure or silently waive it.\n9. Give only the current project root, final MP4, evidence, digests, and review-input contract to a separate `$video-project-review` session. The reviewer creates its input outside the project and invokes `node ${PLUGIN_ROOT}/dist/cli/harness.mjs video review` itself.\n10. After a current independent pass, run `node ${PLUGIN_ROOT}/dist/cli/harness.mjs video release`. Report only release-manifest outputs and label verification claims with execution provenance.\n\nUse every wrapper as one exact standalone command. Do not chain, redirect, pipe, substitute shell expressions, or let an external worker write proof, evidence, review, release, receipt, or admitted paths.\n",
  }),
  codexInterface: {
    shortDescription: "Orchestrate an evidence-bound Remotion video delivery.",
    defaultPrompt: "Use $video-project-authoring to create or continue a staged video project through controlled media admission, independent review, and release.",
  },
  sourceDir: new URL("./", import.meta.url),
});
