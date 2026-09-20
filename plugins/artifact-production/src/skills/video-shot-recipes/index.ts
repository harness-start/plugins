import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "video-shot-recipes",
  fullName: "Video Shot Recipes",
  description: "Select offline shot recipes for evidence-bound Remotion storyboards, covering camera, transitions, UI entrances, kinetic type, data visuals, and motion.",
  useCases: [
    "Select offline shot recipes for evidence-bound Remotion storyboards, covering camera, transitions, UI entrances, kinetic type, data visuals, and motion.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Video Shot Recipes\n\nUse the bundled catalog as a planning and implementation reference. It is pinned to one upstream revision, works offline, and does not imply that a copied source automatically fits the project or passes review.\n\n## Workflow\n\n1. Search by narrative job, moving object, state change, energy, or category:\n\n   `node <plugin-root>/dist/cli/harness.mjs video catalog search <query>`\n\n2. Inspect an exact recipe and style:\n\n   `node <plugin-root>/dist/cli/harness.mjs video catalog show <recipe-id> <style-id>`\n\n3. Choose only an `executable` style for `direct` or `adapted` use. A `reference-only` style may be recorded only as `inspired` and must be implemented independently.\n4. Stage the immutable recipe and source closure with one exact host Tool command:\n\n   `node <plugin-root>/dist/cli/harness.mjs video shot-stage <project-root> <beat-id> <recipe-id> <style-id>`\n\n5. Adapt staged code into a project-owned `src/visual/` unit. Update `implementationPath`, `adaptationNotes`, `usage`, and at least two bounded `reviewFrames` in `plan.shots.json`.\n6. Re-approve the storyboard digest after the shot plan is final. Run lint, render, probe, independent review, and release normally.\n\nFor every storyboard beat in a required shot plan, record exactly one catalog selection or a custom beat with a concrete reason. Keep the catalog revision unchanged. The probe binds decoded review frames to current implementation bytes; the independent reviewer must pass `shotFidelity`. Never claim perceptual equivalence from catalog lookup, staging, compilation, or hook activation alone.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
