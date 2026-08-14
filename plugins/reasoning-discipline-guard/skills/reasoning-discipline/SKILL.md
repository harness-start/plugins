---
name: reasoning-discipline
description: Use a staged, file-backed reasoning workflow for problems where correctness depends on explicit assumptions, strategy choices, multi-step logic, causal discrimination, or consequential trade-offs. Use for proofs, mathematical or combinatorial guarantees, algorithm and ordering correctness, boundary or representation interactions, constraint-heavy analysis, root-cause questions with competing hypotheses, and high-impact decisions that need adversarial review and an independent cross-check. Also use to resume an explicit `.reasoning-discipline/*/workflow.md`. Do not use for simple factual lookup, translation, summarization, mechanical implementation with a direct oracle and no algorithm, boundary, ordering, or representation choice, casual preference questions, creative writing, active incident containment, or designing reasoning prompts, skills, hooks, or plugins.
---

# Reasoning Discipline

Produce compact, inspectable reasoning evidence before giving the conclusion. Do not attempt to expose hidden token-by-token chain of thought. Record assumptions, claims, challenges, checks, and uncertainty at the level another person can audit.

Creating `workflow.md` is the deliberate activation signal for `reasoning-discipline-guard`. Merely loading this Skill does not activate hooks.

## Artifact language

Use this precedence for the active conversation language: an explicit language for the requested output, then an active session language profile, then the predominant natural language of the current user request.

Write every agent-authored natural-language value in the active conversation language, including values inside JSON, YAML, TOML, XML, Markdown machine blocks, tables, and generated files. This applies to questions, success criteria, assumptions, evidence, analysis, challenges, conclusions, uncertainty, and recovery actions.

Keep schema names, keys, enum literals, IDs, identifiers, variables, code, commands, paths, flags, APIs, types, and verbatim quotations unchanged. Professional terms may remain in their conventional language, and explicitly requested translation content follows its requested target language. English placeholder text in a template describes field meaning; it is not the default output language.

## Choose one branch

- `causal`: a concrete observed failure or effect must be explained by discriminating between competing causes.
- `exact`: a proof, calculation, algorithm, logical conclusion, or worst-case guarantee must be established.
- `decision`: alternatives must be compared under objectives, constraints, and sensitivity to assumptions.

When signals overlap, use that priority: concrete causal diagnosis, then exact correctness, then decision.

## Run the workflow

1. Read [`references/artifact-protocol.md`](references/artifact-protocol.md) before creating files.
2. Create the workflow directory if needed, then create `.reasoning-discipline/<yyyyMMdd>-<short-slug>/workflow.md` by itself. Use a stable `RW-<date>-<slug>` id and `run.epoch: 1`.
3. After the hook reports `Bound <id>`, create exactly one stage file per file-mutation tool call, in this order:
   - `01-frame.md`
   - `02-analysis.md`
   - After `RD-R2`, dispatch a read-only subagent whose prompt contains only `RD_REVIEW_REQUEST challenge`. On Codex, use a task name beginning with `rd_challenge_`. Do not write `03-challenge.md` until that reviewer returns an approval bound to the current frame and analysis. Do not give the reviewer your planned attacks or conclusion.
   - `03-challenge.md`
   - After `RD-R3`, dispatch a *different* read-only subagent whose prompt contains only `RD_REVIEW_REQUEST cross-check`. On Codex, use a task name beginning with `rd_cross_check_`. Do not write `04-cross-check.md` until that approval is recorded.
   - `04-cross-check.md`
   - `05-conclusion.md`
4. Wait for each hook-issued receipt. Put it unchanged in the next stage's `previousReceipt`. Never predict or invent a receipt.
5. After `05-conclusion.md` receives `RD-R5`, update `workflow.md` alone: set `status` to `closed`, `currentStage` to `conclusion`, `completionReceipt` to `RD-R5`, and both `resume` fields to `null`.
6. State the calibrated conclusion and cite the workflow path when the requested output format permits it. In `05-conclusion.md`, set `outputContract.mode` to `exact-payload` for a strict final format such as one number or JSON, otherwise use `free-form`. A strict format changes only the presentation: keep the evidence in the artifacts, put the complete final payload in `conclusion`, emit exactly that payload, and never prepend or append workflow status, verification wording, citations, or explanation unless the user requested them.
7. If the next step is implementation with isolated writers, open `$subagent-plan-execution` instead of editing in the parent session.

Use the platform's observable file-mutation channel for every reasoning artifact:

- Codex: use one `apply_patch` call for exactly one artifact file. A shell command may create the parent directory, but must not create or edit `workflow.md` or a stage file.
- Claude Code: use one Write or Edit tool call for exactly one artifact file.

Never create or edit reasoning artifacts through shell redirection, heredocs, `cat`, `sed`, Python, or another command-execution workaround. Those writes do not establish the receipt chain and must be treated as failed activation, even when the files appear on disk.

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

- `exact`: before deriving, audit every dimension that might be chosen, observed, or controlled. Record action-time observability separately in `observabilityAudit`, with a source claim, timing, and implication. A dimension the user says can be sensed or distinguished during action is `observable: true` and defaults to `controlEffect: "allocation"`; it must link to a `kind: "allocation"` participant strategy. Use `controlEffect: "blocked"` only when `overrideSourceRef` cites a verbatim user sentence that explicitly prohibits using that signal for selection; mark that given's `source` as `user-verbatim`. Do not turn an interpretation into a given: precommitting a total, budget, or objective does not by itself prohibit allocation among categories observable during action. Hidden attributes use `observable: false`, `controlEffect: "none"`, and null strategy/override refs. If the participant can distinguish categories while acting, name the allocation count for each category as a separate strategy `component`; a total-only component is invalid until the category-allocation strategy is tested. Give every `strategyVariables` entry its own `controlAssignments` entry through `strategyRef`; its controller must be `solver` or `participant`. Record hidden environment/adversary dimensions as separate entries with `strategyRef: null`. Never combine a participant-controlled choice and a hidden response into one assignment. For each assignment, record its controller, timing, textual basis, strongest alternative assignment, and answer impact. If control changes the answer, compute both models and resolve the wording before concluding. Then write the quantifiers in execution order. Every participant strategy must appear by ID in an `exists` quantifier's `strategyRefs`, and its named components must be those quantifier variables; `forall` and `fixed` quantifiers use an empty array. Add a `strategyEvaluations` entry that fixes exactly those components and varies a named `forall` environment variable. Separate fixed givens, choices controlled by the solver or participant, and values controlled by an adversary or environment. Preserve that order in every optimization: for example, a participant who chooses a strategy before every admissible environment response requires `exists strategy, forall response`, not a maximum over strategies and responses together. In the control-assignment challenge, repeat the same fixed strategy assignment and vary only the environment response; a bad construction with different controlled values is not a counterexample to that strategy. Challenge both a quantifier-order swap and the strongest alternative control assignment, attempt a boundary case or counterexample, and use a genuinely different derivation, deterministic tool, or symbolic solver. In `strategySearches`, independently optimize every allocation strategy over exactly its components while varying a `forall` environment variable; its `bestAssignment` must match an analysis evaluation. Declare `answerBinding: "objective"` only when the numeric objective is the requested answer; use `answerBinding: "supporting"` when the number only ranks or validates a semantic algorithm or policy conclusion. Supporting evidence must never replace `candidateAnswer` or `conclusion`. A finite capacity-bounded partition allocation must include the protocol's `replayModel`, so the guard evaluates every complete joint response and recomputes the minimizing allocation. For other finite bounded models, both the boundary check and strategy search must use a deterministic tool; a prose restatement or an enumeration that omits the participant strategy is not independent evidence.
- `causal`: keep at least two falsifiable hypotheses until a discriminating observation separates them, then use a controlled probe, counterfactual, or independent source.
- `decision`: compare at least two options and perform sensitivity, alternative-weighting, or scenario analysis before recommending one.
- If an independent check is unavailable, say so in `residualUncertainties` and lower confidence. Re-reading the same derivation is not an independent check.

If the initial `workflow.md` write fails, retry that isolated activation once. If it still fails, report that the governed workflow could not be established and do not present a verified conclusion. If the user explicitly prohibits file or tool use, explain that this Skill cannot provide its guarded result under that constraint; do not silently substitute an ungoverned answer.

Hooks validate structure, order, references, and artifact integrity. They do not establish that a claim is true merely because the file validates.
