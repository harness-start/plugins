import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "first-principles",
  fullName: "First Principles",
  description: "Rebuild an unclear concept, system, proposal, or decision from essential constraints instead of inherited labels and conventions. Use when the user asks for first principles, underlying logic, the real problem, a mental model, why something exists, or a from-scratch explanation. Prefer reasoning-methods when the main job is proving an answer, diagnosing a concrete failure, or choosing under quantified uncertainty.",
  useCases: [
    "Use when the user asks for first principles, underlying logic, the real problem, a mental model, why something exists, or a from-scratch explanation.",
  ],
  constraints: [
    "Do not ask for more context unless the missing answer would change the analysis.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# First Principles\n\n## The one rule\n\nRemove inherited names and customary solutions, then rebuild the explanation from constraints that still exist without them.\n\n## Method\n\n1. State the actual question and why its answer matters. Do not ask for more context unless the missing answer would change the analysis.\n2. Take a step back. Identify one to five root questions or constraints that remain after product names, frameworks, and current implementations are removed.\n3. Label the load-bearing inputs as facts, assumptions, conventions, or inferences. Verify important facts when a reliable source or tool is available.\n4. Rebuild the available approaches from those constraints. Explain why multiple approaches exist and what each sacrifices.\n5. Form one transferable mental model. Prefer plain causal language to a taxonomy of terms.\n6. Attack the most important assumption with a counterexample or the cheapest falsifying check. Stop decomposing when another layer would not change understanding or action.\n\n## Standards\n\n- Root questions are distinct enough to change a different part of the answer; do not force a fixed count.\n- Explain why before naming implementation details. Use analogies only when they preserve the important constraint.\n- Separate observed facts from interpretation and say where disagreement is reasonable.\n- Preserve useful conventions. First-principles work is not an excuse to reinvent a solved interface.\n- Prefer one decisive counterexample over a ceremonial list of risks.\n\n## Output\n\nLead with the core insight or mental model. Then show only the root constraints, reconstruction, trade-offs, and falsifier needed for the user to transfer the model elsewhere. Preserve any requested format and do not expose a private token-by-token reasoning transcript.\n\n## Honest limits\n\nThis method can reveal hidden assumptions but cannot make missing evidence true. Novel empirical claims still need observation, research, or experiments. When a convention is itself a hard compatibility or legal constraint, treat it as a fact of the current problem rather than pretending it can be reasoned away.\n",
  }),
  codexInterface: {
    shortDescription: "Rebuild understanding from essential constraints",
    defaultPrompt: "Use first principles to rebuild this problem from its essential constraints.",
  },
  sourceDir: new URL("./", import.meta.url),
});
