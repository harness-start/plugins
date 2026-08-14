---
name: first-principles
description: Rebuild an unclear concept, system, proposal, or decision from essential constraints instead of inherited labels and conventions. Use when the user asks for first principles, underlying logic, the real problem, a mental model, why something exists, or a from-scratch explanation. Prefer reasoning-discipline when the main job is proving an answer, diagnosing a concrete failure, or choosing under quantified uncertainty.
---

# First Principles

## The one rule

Remove inherited names and customary solutions, then rebuild the explanation from constraints that still exist without them.

## Method

1. State the actual question and why its answer matters. Do not ask for more context unless the missing answer would change the analysis.
2. Take a step back. Identify one to five root questions or constraints that remain after product names, frameworks, and current implementations are removed.
3. Label the load-bearing inputs as facts, assumptions, conventions, or inferences. Verify important facts when a reliable source or tool is available.
4. Rebuild the available approaches from those constraints. Explain why multiple approaches exist and what each sacrifices.
5. Form one transferable mental model. Prefer plain causal language to a taxonomy of terms.
6. Attack the most important assumption with a counterexample or the cheapest falsifying check. Stop decomposing when another layer would not change understanding or action.

## Standards

- Root questions are distinct enough to change a different part of the answer; do not force a fixed count.
- Explain why before naming implementation details. Use analogies only when they preserve the important constraint.
- Separate observed facts from interpretation and say where disagreement is reasonable.
- Preserve useful conventions. First-principles work is not an excuse to reinvent a solved interface.
- Prefer one decisive counterexample over a ceremonial list of risks.

## Output

Lead with the core insight or mental model. Then show only the root constraints, reconstruction, trade-offs, and falsifier needed for the user to transfer the model elsewhere. Preserve any requested format and do not expose a private token-by-token reasoning transcript.

## Honest limits

This method can reveal hidden assumptions but cannot make missing evidence true. Novel empirical claims still need observation, research, or experiments. When a convention is itself a hard compatibility or legal constraint, treat it as a fact of the current problem rather than pretending it can be reasoned away.
