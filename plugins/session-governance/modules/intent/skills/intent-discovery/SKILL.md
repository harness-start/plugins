---
name: intent-discovery
description: Front-load intent, repository context, plausible interpretations, and adversarial checks before acting on a first request or a materially new task. Use when hook context marks a first-turn discovery pass, when the same conversation starts a new outcome or deliverable, or when the user explicitly asks to explore context and assumptions up front. Do not rerun for continuations, follow-ups, or corrections. Keep simple requests direct; use bounded generic subagents only when independent evidence can change the approach.
---

# Intent Discovery

Before discovery, classify the request as light, standard, or intensive using this Skill. Explore repository context first. Do not wait for user approval during an eligible discovery pass; continue with the lowest-risk reversible interpretation.

## Route at task boundaries

Run the full discovery pass for the first request in a session, or later when the user starts a materially new task: a new outcome, deliverable, target system, or scope whose interpretation needs fresh evidence. The first-turn Hook is only a one-time mechanical injection; later eligibility comes from normal Skill routing and requires no persisted conversation state.

Do not rerun full discovery for a continuation, follow-up, correction, status request, or request to keep working on the current outcome. Reuse the current working intent and inspect only the new evidence needed for that delta.

## The one rule

Resolve discoverable uncertainty before committing to an interpretation, then continue without turning discovery into a user approval ceremony.

## Build the working intent

1. Extract the requested outcome, deliverable, success conditions, constraints, exclusions, and irreversible decisions. Separate facts, inferences, and falsifiable assumptions.
2. Inspect the current project instructions, relevant entrypoints, callers, nearby tests, documentation, configuration, and recent history before asking anyone for facts the environment can supply. For concrete repository work, time-box this pass; repeated evidence means stop searching and reproduce the behavior. Never hunt for hidden evaluator artifacts, solution patches, or answer caches. Browse only when current, external, or unfamiliar facts can change the action.
3. Form two or three plausible interpretations only when they lead to materially different work. Steelman the strongest alternative and identify the load-bearing assumption or cheapest falsifying check.
4. Choose the lowest-risk reversible interpretation supported by the evidence. Keep a compact, ephemeral Intent Brief: outcome, facts, selected interpretation, material assumptions, rejected alternative, evidence gaps, and next action.
5. Continue with the user's request. Do not ask the user for clarification or approval as part of this discovery pass. Host safety, permission, and irreversible-action requirements still apply.

## Allocate depth

- **light** — Use for a stable fact, translation, formatting request, direct answer, or small task whose seam and oracle are already clear. Let the parent perform one quick context check and continue; do not spawn workers.
- **standard** — Use when repository facts or one material assumption can change the implementation. Start at most two concurrent read-only workers: a context scout and an assumption challenger. The parent inspects the main entrypoint at the same time.
- **intensive** — Use for vague, cross-module, high-impact, novel, or externally dependent work. Start at most three concurrent read-only workers: a context scout, an interpretation mapper, and an adversarial reviewer. After fan-in, use one fresh reviewer only when the decision remains consequential; permit one targeted revision, never an open-ended debate.

More workers and more turns are not evidence. Escalate depth only when the extra result can change the selected interpretation, scope, or safety boundary.

## Delegate with evidence boundaries

Use generic host-native subagents; do not require plugin-owned agent definitions. Give each worker only the prompt, paths, constraints, and question needed for its independent branch. Workers must not edit files, contact the user, make the final decision, or receive another worker's conclusions before returning their own result.

Use this Task Brief shape:

```text
Objective:
Non-goals:
Scope and inputs:
Allowed read-only tools:
Forbidden actions:
Required evidence:
Failure policy: return the gap; do not guess
Output: Subagent Result Card
```

Require this Subagent Result Card:

```text
Answer:
Evidence:
Files or sources inspected:
Verification:
Assumptions:
Gaps:
Parent action needed:
```

The parent reconciles conflicts, reopens decisive evidence, and owns the resulting action. If one worker fails, continue with the remaining evidence and record the gap. If the host has no subagent capability, use the same stages in a single-agent pass and continue without pausing.

## Review without self-hypnosis

- Challenge the strongest version of the selected interpretation, not a weak caricature.
- Prefer a repository fact, deterministic oracle, primary source, controlled probe, or concrete counterexample over another model turn.
- Change the working intent only when new evidence or a valid counterexample bears on it. Do not reverse a supported choice merely because a reviewer was told to criticize it.
- Stop after the decisive assumption is checked or one targeted repair no longer changes the next action.

## Output

Do the requested work and preserve any strict output format the user requested. Surface only material assumptions, trade-offs, evidence gaps, or alternatives the user needs to understand the result. Do not dump the Intent Brief, worker transcripts, or private token-by-token reasoning.

## Honest limits

This method can expose missing context but cannot recover facts absent from the workspace, tools, or reliable sources. Same-model workers may share blind spots, and subagent activity alone does not prove improved understanding. Treat the final interpretation as a bounded working hypothesis and rely on task-level tests or external evidence for consequential claims.
