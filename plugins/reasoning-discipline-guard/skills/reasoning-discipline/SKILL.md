---
name: reasoning-discipline
description: Use a staged, file-backed reasoning workflow for problems where correctness depends on explicit assumptions, strategy choices, multi-step logic, causal discrimination, or consequential trade-offs. Use for proofs, mathematical or combinatorial guarantees, algorithm correctness, constraint-heavy analysis, root-cause questions with competing hypotheses, and high-impact decisions that need adversarial review and an independent cross-check. Also use to resume an explicit `.reasoning-discipline/*/workflow.md`. Do not use for simple factual lookup, translation, summarization, routine implementation under a settled specification, casual preference questions, creative writing, active incident containment, or designing reasoning prompts, skills, hooks, or plugins.
---

# Reasoning Discipline

Produce compact, inspectable reasoning evidence before giving the conclusion. Do not attempt to expose hidden token-by-token chain of thought. Record assumptions, claims, challenges, checks, and uncertainty at the level another person can audit.

Creating `workflow.md` is the deliberate activation signal for `reasoning-discipline-guard`. Merely loading this Skill does not activate hooks.

## Choose one branch

- `causal`: a concrete observed failure or effect must be explained by discriminating between competing causes.
- `exact`: a proof, calculation, algorithm, logical conclusion, or worst-case guarantee must be established.
- `decision`: alternatives must be compared under objectives, constraints, and sensitivity to assumptions.

When signals overlap, use that priority: concrete causal diagnosis, then exact correctness, then decision.

## Run the workflow

1. Read [`references/artifact-protocol.md`](references/artifact-protocol.md) before creating files.
2. Create `.reasoning-discipline/<yyyyMMdd>-<short-slug>/workflow.md` by itself. Use a stable `RW-<date>-<slug>` id and `run.epoch: 1`.
3. After the hook reports `Bound <id>`, create exactly one stage file per file-mutation tool call, in this order:
   - `01-frame.md`
   - `02-analysis.md`
   - `03-challenge.md`
   - `04-cross-check.md`
   - `05-conclusion.md`
4. Wait for each hook-issued receipt. Put it unchanged in the next stage's `previousReceipt`. Never predict or invent a receipt.
5. After `05-conclusion.md` receives `RD-R5`, update `workflow.md` alone: set `status` to `closed`, `currentStage` to `conclusion`, `completionReceipt` to `RD-R5`, and both `resume` fields to `null`.
6. Cite the workflow path in the final response and state the calibrated conclusion. Do not dump all artifact prose into the response.

Keep claim IDs unique across the workflow. References must point to existing IDs. A revision to an accepted stage invalidates that stage and everything after it, so rewrite downstream stages in order.

## Pause or abort

If a missing user decision, inaccessible observation, or external dependency prevents the next stage, update `workflow.md` alone:

- `status: paused`
- `resume.nextStage`: the first incomplete stage
- `resume.nextAction`: the concrete fact or action needed

Then ask for the missing information without claiming a conclusion.

To resume in a later session, read the manifest and all stage files before `resume.nextStage`. Update `workflow.md` alone: increment `run.epoch`, set `status` to `open`, and preserve `currentStage`, `resume.nextStage`, and `resume.nextAction` at the first incomplete stage. The hook recomputes the earlier files and rebuilds receipts only when their schemas, references, receipt chain, and digests are valid. Continue with exactly `resume.nextStage`; do not rewrite accepted earlier stages unless correcting them.

Use `status: aborted` only when the user cancels the reasoning task. Keep `completionReceipt` as `null` and do not present an aborted candidate as a verified conclusion.

## Verification discipline

- `exact`: write the quantifiers in execution order before deriving. Separate fixed givens, choices controlled by the solver or participant, and values controlled by an adversary or environment. Preserve that order in every optimization: for example, a participant who chooses a strategy before every admissible environment response requires `exists strategy, forall response`, not a maximum over strategies and responses together. Then attempt a boundary case or counterexample, explicitly attack a possible quantifier-order swap, and use a genuinely different derivation, deterministic tool, or symbolic solver.
- `causal`: keep at least two falsifiable hypotheses until a discriminating observation separates them, then use a controlled probe, counterfactual, or independent source.
- `decision`: compare at least two options and perform sensitivity, alternative-weighting, or scenario analysis before recommending one.
- If an independent check is unavailable, say so in `residualUncertainties` and lower confidence. Re-reading the same derivation is not an independent check.

Hooks validate structure, order, references, and artifact integrity. They do not establish that a claim is true merely because the file validates.
