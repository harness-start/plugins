import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "logo-project-review",
  fullName: "Logo Project Review",
  description: "Independently review final logo masters, variants, construction sheets, exports, and previews, then submit the digest-bound review input.",
  useCases: [
    "Independently review final logo masters, variants, construction sheets, exports, and previews, then submit the digest-bound review input.",
  ],
  constraints: [
    "do not average away a weak criterion.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Logo Project Review\n\nAct as a read-only independent reviewer. Inspect the current final visuals before reading the brief: record the cue you notice and a one-sentence pre-contract retell. Then read [Review contract](references/review-contract.md) and the communication core. Inspect the current master roles, every primary/mono/reverse SVG, secondary lockup, transparent PNG/icon exports, construction sheets, specimen/application renders, and 16/32/64 black/reverse preview samples.\n\nCompare the blind retell with the exact target, then review core fidelity, signature-cue visibility, semantic causality, invariant continuity, brief fidelity, exact wordmark copy, script/case fidelity, spacing rhythm, concept divergence, vector craft, silhouette/minimum-size legibility, mono/reverse behavior, scene application, delivery completeness, structure consistency, optical correction, one memory point, semantic integration, mark/wordmark relationship, and restraint. Path presence alone does not prove a visually correct glyph. Every required score is 2 or the review fails; do not average away a weak criterion. Anchor every finding and communication check to current evidence.\n\nWrite one external JSON file and invoke only `node ${PLUGIN_ROOT}/dist/cli/harness.mjs logo review` in this independent session or explicitly assigned Claude review subagent. On Codex, set `reviewer.sessionId` to the exact `CODEX_THREAD_ID` and set `reviewer.transcriptPath` to the absolute path of the current child rollout under `$CODEX_HOME/sessions`. Never use or copy `CODEX_SESSION_ID`; it identifies the parent in a spawned review. On Claude, use the trusted `reviewer.sessionId` injected by the plugin's `SubagentStart` hook; never guess or copy the parent session id. Return the admitted review hash, inspected hashes, remaining non-blocking risks, and gaps. Do not claim release validity.\n",
  }),
  codexInterface: {
    shortDescription: "Independently review final logo artifacts",
    defaultPrompt: "Use $logo-project-review to inspect and review a rendered logo project independently.",
  },
  sourceDir: new URL("./", import.meta.url),
});
