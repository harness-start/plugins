import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "artifact-creative-direction",
  fullName: "Artifact Creative Direction",
  description: "Develop and compare bounded creative directions before an artifact project is initialized. Use when the user requests alternatives, a fresh direction, or help escaping repetitive concepts for a diagram, logo, music, poster, presentation, training program, or video. Do not use for routine authoring, writing project files, review, release, or receipts.",
  useCases: [
    "Use before initialization when the user requests alternatives, a fresh direction, or help escaping repetitive artifact concepts.",
  ],
  constraints: [
    "Remain read-only: do not write project files, invoke artifact writers, perform review, release an artifact, or issue receipts.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Artifact Creative Direction\n\nThis is read-only pre-init advice. It does not write the artifact, initialize a project, review or release the artifact, or issue evidence and receipts.\n\n## Method\n\n1. Restate the audience, job, fixed constraints, open variables, existing brand or source evidence, and what feels repetitive or blocked.\n2. Choose exactly one technique:\n   - **assumption inversion** for a load-bearing convention;\n   - **concept fan** when the proposed solution may be solving the wrong-level problem;\n   - **mechanism analogy** for a derivative direction that needs a different operating principle;\n   - **SCAMPER** when a coherent seed needs transformation;\n   - **bounded stimulus** when the space is empty and needs one relevant constraint.\n3. Generate a maximum of three live directions. Make them mechanism-distinct, not cosmetic variants. For each, state its mechanism, observable implications, cost, risk, and fastest validation.\n4. Keep convergence visible: list any duplicate, forced route, or dead end that was abandoned and why. Do not silently replace a weak option to fill a quota.\n5. Compare live directions against the audience job, brief, retell target, constraints, and signature cue. Recommend one only when those criteria distinguish it; otherwise ask one bounded selection question.\n6. Return a compact advisory brief for the owning authoring Skill. Advice is not evidence and creates no schema field; the author integrates the chosen direction into the same existing brief before initialization.\n",
  }),
  codexInterface: {
    shortDescription: "Explore bounded artifact directions before initialization",
    defaultPrompt: "Use $artifact-creative-direction to compare creative directions before starting the artifact project.",
  },
  sourceDir: new URL("./", import.meta.url),
});
