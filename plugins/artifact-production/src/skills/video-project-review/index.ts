import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "video-project-review",
  fullName: "Video Project Review",
  description: "Independently review a rendered video and its evidence for narrative, pacing, motion, composition, captions, audio, rights, and profile fidelity.",
  useCases: [
    "Independently review a rendered video and its evidence for narrative, pacing, motion, composition, captions, audio, rights, and profile fidelity.",
  ],
  constraints: [
    "Do not edit source, assets, plans, proof, or evidence.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Video Project Review\n\nAct as an independent reviewer. Inspect the final MP4 before reading the direction contract and record the primary transformation plus a one-sentence pre-contract retell. Then read [Review contract](references/review-contract.md), compare that blind read with the communication core, inspect the current evidence, and create the review input outside the artifact root.\n\nDo not edit source, assets, plans, proof, or evidence. Do not accept a producer summary in place of inspecting the media. Record `reviewerRetell`, the five evidence-bearing communication checks, and concrete findings; use `verdict: pass` only when every required check passes. Invoke `node ${PLUGIN_ROOT}/dist/cli/harness.mjs video review <root> <external-review-input>` in this reviewer session; the writer binds the real host session and rejects self-review.\n",
  }),
  codexInterface: {
    shortDescription: "Independently review a rendered video and its evidence.",
    defaultPrompt: "Use $video-project-review to inspect the current final video and submit an independent digest-bound review.",
  },
  sourceDir: new URL("./", import.meta.url),
});
