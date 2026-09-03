---
name: engineering-judgment
description: Reduce common coding mistakes with explicit assumptions, surgical edits, bounded ablation, and verifiable success criteria. Use for non-trivial implementation or refactoring. Do not use for read-only code review or concrete software failures.
---

# Engineering Judgment

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
- Prefer the smallest design whose responsibilities are justified by the observable contract.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## Observable Contract Challenge

Before choosing an implementation for a non-trivial fix, derive the applicable observable contract from the request, existing API, callers, tests, documentation, and history:

- returned value plus type, container, and shape;
- zero, one, and many-item cardinalities or other boundary classes;
- ordering and stability guarantees;
- warning and error behavior;
- compatibility of existing accepted calls, including public signature behavior.

A passing reproduction of one example is not complete evidence. Add the cheapest independent counterexample that could falsify the proposed mechanism. Prefer an existing repository primitive when it already establishes the contract, and do not search for hidden evaluator artifacts or solution patches.

For a boundary fix, identify the first transform that can erase a required distinction, such as coercion, flattening, deduplication, sorting, or aggregation. Challenge it with asymmetric boundary cases, not only a single happy path. Evolve the named public seam rather than introducing a private parallel implementation with different semantics, and reuse an established repository or standard-library primitive before writing a new algorithm.

## 3. Bounded Ablation

**Treat every new layer as a hypothesis, then remove only what evidence shows is unnecessary.**

After the first coherent implementation slice passes its focused checks:

1. Inspect only structures introduced or changed by the current task: wrappers, interfaces, generic parameters, branches, configuration, dependencies, tools, agents, or workflow stages.
2. For each candidate, name the observable responsibility it is supposed to provide.
3. Remove or inline one candidate at a time. Run the same focused test, validator, or oracle used before the removal.
4. Keep the simpler variant only when the observable contract and required non-test constraints still hold. Otherwise restore that candidate without disturbing other accepted changes.
5. Stop when no candidate can be removed safely, or when another experiment would cross the authorized scope.

For a plan or design without an implementation, perform the same comparison on paper: test the simpler candidate against the stated success criteria and the cheapest falsifying counterexample.

Do not use deleted lines, file count, or number of abstractions as the success metric. A green focused test does not authorize removing load-bearing security, compatibility, platform separation, persistence, recovery, or project ownership boundaries that the oracle cannot observe.

## 4. Surgical Changes

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

## 5. Goal-Driven Execution

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

## Independent Review Checkpoint

After the first coherent implementation slice and its focused checks pass, use the bundled `engineering-review-checkpoint` workflow before broad verification or delivery when the change is high risk. High-risk changes cross modules or affect a public API, CLI, configuration contract, authentication, security, input boundaries, persistence, migrations, concurrency, data integrity, deployment, runtime state, recovery, rollback, or observability.

The checkpoint coordinates at most one read-only reviewer. It is also available whenever the user explicitly requests a review checkpoint or asks to summon an engineering critic. Ordinary local changes do not need this extra model turn.
