import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "poster-project-review",
  fullName: "Poster Project Review",
  description: "Independently review current poster PNG variants and submit a digest-bound verdict through the registered review writer.",
  useCases: [
    "Independently review current poster PNG variants and submit a digest-bound verdict through the registered review writer.",
  ],
  constraints: [
    "Do not edit project files, regenerate artwork, accept stale digests, or release the project.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Poster Project Review\n\nInspect every current PNG at full size and thumbnail size before reading the art-direction contract. Record the dominant cue and a one-sentence pre-contract retell. Then read [Review contract](references/review-contract.md) and compare that blind read with the communication core. Do not edit project files, regenerate artwork, accept stale digests, or release the project.\n\nCreate `poster-production/review-input/v4` JSON outside the project. Bind the current artifact id, subject digest, every variant id and PNG digest, your own session id, structured checks, findings, `reviewerRetell`, `communicationReview`, and verdict. Every check and finding has an exact visual anchor, concrete evidence, and recovery path.\n\nAll required checks must pass. Unresolved findings are not hidden or downgraded. Invoke `node ${PLUGIN_ROOT}/dist/cli/harness.mjs poster review <project-root> <external-input>` yourself in this independent session, then return only the admitted review result and actionable findings.\n",
  }),
  codexInterface: {
    shortDescription: "Independently review digest-bound poster variants",
    defaultPrompt: "Review the supplied poster project with $poster-project-review and submit only a digest-bound independent verdict.",
  },
  sourceDir: new URL("./", import.meta.url),
});
