import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "reasoning-methods",
  fullName: "Reasoning Discipline",
  description: "Select a compact, task-specific reasoning and verification structure for exact problems, causal diagnosis, consequential decisions, or factual synthesis where a plausible answer is not enough. Use when correctness depends on quantifiers, boundaries, competing hypotheses, load-bearing assumptions, external evidence, counterexamples, or calibrated uncertainty. Do not use for simple lookup, translation, routine implementation with a direct test oracle, creative writing, or requests whose answer is already mechanically determined.",
  useCases: [
    "Use when correctness depends on quantifiers, boundaries, competing hypotheses, load-bearing assumptions, external evidence, counterexamples, or calibrated uncertainty.",
  ],
  constraints: [
    "Do not use for simple lookup, translation, routine implementation with a direct test oracle, creative writing, or requests whose answer is already mechanically determined.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Reasoning Discipline\n\n## The one rule\n\nUse the cheapest task-specific reasoning structure that can falsify the conclusion; more thinking is not evidence by itself.\n\n## Method\n\n1. State the decision or answer being sought, the constraints that can change it, and the strongest plausible alternative.\n2. Select only the modules the task needs:\n   - **exact**: formalize control, observability, quantifier order, and boundary conditions; derive a candidate; attack it with a counterexample; use a solver or deterministic oracle when available.\n   - **causal**: preserve at least two falsifiable hypotheses; find the observation that separates them; run a controlled probe or obtain external evidence before naming a root cause.\n   - **decision**: make the objective and constraints explicit; steelman the best alternative; identify the load-bearing number or assumption; run sensitivity analysis and the cheapest kill test.\n   - **factual**: draft the critical claims as verification questions; answer them independently from primary sources or tools; revise only claims changed by that evidence.\n3. Allocate depth adaptively:\n   - **light**: answer directly when one stable constraint or reliable oracle settles the task.\n   - **standard**: build one explicit model and run one adversarial or external check.\n   - **intensive**: use independent derivations, search, or multiple observations only for high-stakes work, explicit requests, or cases with a credible verifier.\n4. Prefer external feedback. If none exists, mask or restate the decisive condition and reconstruct what it would have to be for the candidate answer to hold. Do not change a correct answer merely because it was challenged.\n5. Stop when the decisive condition has been checked and additional work is unlikely to change the conclusion.\n\n## Standards\n\n- Separate facts, inferences, and falsifiable assumptions.\n- Keep alternatives alive until evidence discriminates between them.\n- Match confidence to the independence and coverage of verification, not to prose length.\n- A tool call, extra model turn, or completed format is not proof. Cite the observable result that bears on the conclusion.\n- Ask one question only when its answer can change the model or action; otherwise state a bounded assumption and continue.\n\n## Output\n\nPut the verdict first. Follow with the strongest reason, the evidence boundary, and the most useful counterexample, kill test, or statement of what would change the conclusion. Include derivation details only when the user needs to audit them. Preserve strict output formats and do not reveal private token-by-token chain of thought.\n\n## Honest limits\n\nThe method improves structure, not intelligence. Same-model self-review can reinforce an error or abandon a correct answer, especially without external feedback. Unknown facts require research; causal claims require observations; high-impact decisions may still require a domain expert. Say what was not verified instead of filling the gap with confidence.\n",
  }),
  codexInterface: {
    shortDescription: "Choose and verify the right reasoning structure",
    defaultPrompt: "Use adaptive reasoning discipline to solve and verify this problem.",
  },
  sourceDir: new URL("./", import.meta.url),
});
