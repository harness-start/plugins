---
name: engineering-judgment
description: Reduce common coding mistakes with explicit assumptions, surgical edits, and verifiable success criteria. Use for non-trivial implementation or refactoring. Do not use for read-only code review or concrete software failures.
---

# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes, derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## Observable Contract Challenge

Before choosing an implementation for a non-trivial fix, derive the applicable observable contract from the request, existing API, callers, tests, documentation, and history:

- returned value plus type, container, and shape;
- zero, one, and many-item cardinalities or other boundary classes;
- ordering and stability guarantees;
- warning and error behavior;
- compatibility of existing accepted calls, including public signature behavior.

A passing reproduction of one example is not complete evidence. Add the cheapest independent counterexample that could falsify the proposed mechanism. Prefer an existing repository primitive when it already establishes the contract, and do not search for hidden evaluator artifacts or solution patches.

For a boundary fix, identify the first lossy transform in the established pipeline: broadcasting, flattening, coercion, deduplication, sorting, or aggregation can erase distinctions that the result must preserve. Challenge multi-input boundaries with mixed states, not only the symmetric case: use unequal cardinality such as one empty component beside a singleton, one invalid component beside a valid one, and different shapes where the public contract permits them. Treat the behavior requested by the issue as the contract candidate; the current exception or rejection is not compatibility evidence unless local documentation or callers require it. Assert that every output component equals its corresponding input in value and shape instead of merely checking shapes or preserving the exception. Branch before the lossy step when required, then rejoin the shared return assembler or postprocessor; otherwise reuse the normal pipeline. A branch-local synthesized result remains suspect because it can silently change container, shape, ordering, metadata, or alternate calling forms.

When the requirement expands arity or composition, evolve the named seam rather than introducing a private parallel implementation with different semantics. Keep every proven accepted call form working, and add or extend durable tests for zero, one, two, and many inputs through that seam. Compatibility protects documented results and accepted call syntax; it does not justify a one-input fast path that preserves an incidental container or internal representation without evidence.

For ordering or dependency behavior, search the entire repository and language standard library for an existing stable primitive before implementing a graph or merge algorithm. Use search concepts such as `stable`, `topological`, and `dependency`, then inspect candidate callers and tests. If no suitable primitive exists, define the unresolved degrees of freedom explicitly. Before completion, add a direct durable test with two completely disjoint chains containing at least two items each to prove stable ready-frontier behavior: discovery order `[a1, a2, b1, b2]` with chains `a1→a2` and `b1→b2` yields `[a1, b1, a2, b2]`, not `[a1, a2, b1, b2]`. Single-item chains and a three-chain example with a cross-chain dependency are not equivalent. Test an adjacent duplicate inside one chain, which must not become a self-dependency or cycle; testing only duplicates shared across separate chains does not establish this. Also cover a genuine cycle and its fallback, and the exact warning or error contract. A single requested ordering cannot prove those semantics, and flattened first-appearance order or one-at-a-time greedy readiness is not automatically a valid stable partial-order rule.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
