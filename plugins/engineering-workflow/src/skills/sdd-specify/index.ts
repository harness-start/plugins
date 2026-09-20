import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "sdd-specify",
  fullName: "SDD Specify",
  description: "Create or repair an SDD change spec.md with intent, requirements, scenarios, and non-goals. Use when an SDD change has no valid spec, requirements are unclear, or an upstream specification must be revised before planning.",
  useCases: [
    "Use when an SDD change has no valid spec, requirements are unclear, or an upstream specification must be revised before planning.",
  ],
  constraints: [
    "do not repeatedly extend an unavailable scout.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# SDD Specify\n\nWrite the smallest contract that makes the change testable. Read the touched code, tests, project rules, and current behavior before inventing requirements.\n\n## Discovery budget\n\n- For a familiar, bounded change, inspect directly without a worker.\n- For unfamiliar Brownfield code, dispatch one read-only fact scout.\n- For cross-module, public-contract, security, schema, migration, or other high-risk work, add one adversarial scout with a distinct question.\n- Use `fork_turns: \"none\"`, maximum concurrency 2, and no nested delegation. Fall back to the parent when isolated subagents are unavailable.\n\nGive scouts a scoped Task Brief with a unique `brief-id` and require a Result Card no larger than 4 KiB that echoes it. The echo is necessary correlation, not proof of direct delivery. Reject a missing/wrong id, unexpected descendant, forbidden tool use, or unverifiable scope; interrupt when possible and use the parent fallback. The parent reconciles conflicts and writes `spec.md`; scouts never edit `.specs/**`.\nUse one short host wait for the first Result Card; do not repeatedly extend an unavailable scout.\n\n## Artifact contract\n\nUse exactly this shape:\n\n```markdown\n# Spec: <title>\n\n## Intent\n<why and observable outcome>\n\n## Requirements\n\n### REQ-001: <title>\n<behavioral requirement>\n\n#### Scenario: <name>\n- Given <precondition>\n- When <action>\n- Then <observable result>\n\n## Non-goals\n- <explicit exclusion>\n```\n\nAssign unique `REQ-NNN` IDs. Give every requirement at least one non-empty Given/When/Then scenario. Remove `TODO`, `TBD`, `NEEDS CLARIFICATION`, and `[?]`. Do not embed design decisions unless they are part of the user-visible contract.\n\nAfter writing, run the bundled validator. If an old plan or tasks becomes stale, report that as the expected recovery path; do not preserve an obsolete digest.\n",
  }),
  codexInterface: {
    shortDescription: "Define requirements, scenarios, and non-goals.",
    defaultPrompt: "Use $sdd-specify to write a focused specification for this change.",
  },
  sourceDir: new URL("./", import.meta.url),
});
