import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "sdd-plan",
  fullName: "SDD Plan",
  description: "Create or repair an SDD change plan.md from a valid spec.md, binding the current specification digest and requirement coverage. Use when an SDD specification is ready but its technical plan is missing, invalid, or stale.",
  useCases: [
    "Use when an SDD specification is ready but its technical plan is missing, invalid, or stale.",
  ],
  constraints: [
    "do not guess or copy a stale value.",
    "Before committing, run a pre-mortem, mark every irreversible or one-way-door choice, and put the cheapest kill test for the load-bearing assumption in the existing Risks and Validation sections.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# SDD Plan\n\nRefuse to plan against an invalid spec. Compute the canonical SHA-256 with the bundled validator's `digest` command; do not guess or copy a stale value.\n\n## Focused exploration\n\nFor a cross-module or unfamiliar change, use at most two parallel read-only agents: one for architecture/change surface and one for tests/risks. Use `fork_turns: \"none\"`, maximum concurrency 2, no nested delegation, a scoped Task Brief with a unique `brief-id`, and a Result Card no larger than 4 KiB that echoes it. The echo is necessary correlation, not proof of direct delivery. Reject a missing/wrong id, unexpected descendant, forbidden tool use, or unverifiable scope; interrupt when possible and use the single-agent fallback. The parent alone resolves tradeoffs and writes `plan.md`.\nUse one short host wait for the first Result Card; do not repeatedly extend an unavailable explorer.\n\n## Artifact contract\n\n```markdown\n# Plan: <title>\n\nSpec-Digest: sha256:<current spec digest>\n\n## Approach\n<implementation approach with every REQ-NNN referenced>\n\n## Change Surface\n- <repository-relative path or module>\n\n## Risks\n- <risk and mitigation>\n\n## Validation\n- <behavioral and automated validation plan>\n```\n\nCover every requirement ID. Prefer the smallest change surface and existing repository conventions. Treat validation entries as future recipes, never as evidence that commands have run. Run the bundled validator after writing and repair every finding before task decomposition.\n",
  }),
  codexInterface: {
    shortDescription: "Plan a validated specification with provenance.",
    defaultPrompt: "Use $sdd-plan to produce a traceable implementation plan.",
  },
  sourceDir: new URL("./", import.meta.url),
});
