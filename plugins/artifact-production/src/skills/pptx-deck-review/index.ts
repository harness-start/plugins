import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "pptx-deck-review",
  fullName: "PPTX Deck Review",
  description: "Independently review the final rendered PNG pages of a PPTX project for visual hierarchy, consistency, legibility, clipping, content coherence, and accessibility, then produce the external review-input JSON consumed by presentation-production. Use only after render and probe; never use in the producing or releasing session.",
  useCases: [
    "Independently review the final rendered PNG pages of a PPTX project for visual hierarchy, consistency, legibility, clipping, content coherence, and accessibility, then produce the external review-input JSON consumed by presentation-production.",
  ],
  constraints: [
    "Do not edit the project, its source, evidence, pages, or receipt.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# PPTX Deck Review\n\nAct as an independent, read-only reviewer. Read [Review contract](references/review-contract.md) before starting. Do not edit the project, its source, evidence, pages, or receipt.\n\nInspect every final `dist/pages/NNN.png` at readable resolution before reading the plan. Record the first conclusion or action you recover and a one-sentence pre-contract retell. Then compare the page order and hashes supplied by the producer with the manifest and compare the blind retell with the communication core. Review core fidelity, signature-cue continuity, semantic causality, narrative continuity, assertion clarity, hierarchy, density, alignment, typography, color use, contrast, non-color encoding, clipping, image quality, and consistency.\n\nWrite one external JSON file outside the project root. Set `reviewer.sessionId` to the host session id reported by the guard, then invoke the exact registered `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation review <project-root> <external-json>` wrapper in this reviewer session. This wrapper is your only project mutation. A `pass` verdict is allowed only when every page is covered and every finding is either fixed in a newly rendered artifact or explicitly accepted with a reason. Never reuse findings against changed page hashes.\n\nReturn a short Result Card containing the review-input path, admitted review hash, inspected page hashes, remaining accepted risks, checks performed, and gaps. Do not claim structure, editability, or release validity; those belong to the probe and release gates.\n",
  }),
  codexInterface: {
    shortDescription: "Independently review final PPTX page renders",
    defaultPrompt: "Use $pptx-deck-review to independently review a rendered PPTX deck.",
  },
  sourceDir: new URL("./", import.meta.url),
});
