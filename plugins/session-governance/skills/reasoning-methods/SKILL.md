---
name: reasoning-methods
description: Select a compact, task-specific reasoning and verification structure for exact problems, causal diagnosis, consequential decisions, or factual synthesis where a plausible answer is not enough. Use when correctness depends on quantifiers, boundaries, competing hypotheses, load-bearing assumptions, external evidence, counterexamples, or calibrated uncertainty. Do not use for simple lookup, translation, routine implementation with a direct test oracle, creative writing, or requests whose answer is already mechanically determined.
---

# Reasoning Discipline

## The one rule

Use the cheapest task-specific reasoning structure that can falsify the conclusion; more thinking is not evidence by itself.

## Method

1. State the decision or answer being sought, the constraints that can change it, and the strongest plausible alternative.
2. Select only the modules the task needs:
   - **exact**: formalize control, observability, quantifier order, and boundary conditions; derive a candidate; attack it with a counterexample; use a solver or deterministic oracle when available.
   - **causal**: preserve at least two falsifiable hypotheses; find the observation that separates them; run a controlled probe or obtain external evidence before naming a root cause.
   - **decision**: make the objective and constraints explicit; steelman the best alternative; identify the load-bearing number or assumption; run sensitivity analysis and the cheapest kill test.
   - **factual**: draft the critical claims as verification questions; answer them independently from primary sources or tools; revise only claims changed by that evidence.
3. Allocate depth adaptively:
   - **light**: answer directly when one stable constraint or reliable oracle settles the task.
   - **standard**: build one explicit model and run one adversarial or external check.
   - **intensive**: use independent derivations, search, or multiple observations only for high-stakes work, explicit requests, or cases with a credible verifier.
4. Prefer external feedback. If none exists, mask or restate the decisive condition and reconstruct what it would have to be for the candidate answer to hold. Do not change a correct answer merely because it was challenged.
5. Stop when the decisive condition has been checked and additional work is unlikely to change the conclusion.

## Standards

- Separate facts, inferences, and falsifiable assumptions.
- Keep alternatives alive until evidence discriminates between them.
- Match confidence to the independence and coverage of verification, not to prose length.
- A tool call, extra model turn, or completed format is not proof. Cite the observable result that bears on the conclusion.
- Ask one question only when its answer can change the model or action; otherwise state a bounded assumption and continue.

## Output

Put the verdict first. Follow with the strongest reason, the evidence boundary, and the most useful counterexample, kill test, or statement of what would change the conclusion. Include derivation details only when the user needs to audit them. Preserve strict output formats and do not reveal private token-by-token chain of thought.

## Honest limits

The method improves structure, not intelligence. Same-model self-review can reinforce an error or abandon a correct answer, especially without external feedback. Unknown facts require research; causal claims require observations; high-impact decisions may still require a domain expert. Say what was not verified instead of filling the gap with confidence.
