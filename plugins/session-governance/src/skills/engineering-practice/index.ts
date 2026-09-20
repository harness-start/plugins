import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "engineering-practice",
  fullName: "Engineering Practice",
  description: "Route implementation, high-risk review checkpoints, read-only code review, and completion-time verification to this plugin's first-party method Skills. Use for non-trivial coding, review requests, or before claiming work is done. Concrete software failures belong to a dedicated debugging workflow, not this plugin.",
  useCases: [
    "Use for non-trivial coding, review requests, or before claiming work is done.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Engineering Practice\n\nUse only the optional method guides that help this task; working directly is valid:\n\n| Situation | Skill |\n|---|---|\n| Non-trivial implementation or refactoring | `engineering-judgment`, including its bounded one-factor ablation pass after focused GREEN |\n| High-risk implementation after a coherent slice and focused checks, or an explicit checkpoint request | `engineering-review-checkpoint` |\n| Read-only code review | `engineering-review` |\n| About to claim complete, fixed, passing, commit, or PR | `engineering-verification` |\n\nHooks remain independent enforcement. Loading a Skill or injecting SessionStart context is neither a prerequisite nor completion evidence. Completion claims need fresh verification against the changed public behavior.\n\nBounded ablation is a method, not a deletion quota or Stop gate. It removes one task-local candidate at a time and keeps the simpler variant only when the same observable contract and verification oracle still pass.\n\nVerification is proportional to the claim. A narrow, low-risk change with a stable interface and direct oracle uses focused verification; high-risk or cross-boundary work uses broader verification. Commit or pull-request intent alone does not expand the local command set, while explicit project and CI gates remain authoritative.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
