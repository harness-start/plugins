---
name: debug-workflow
description: Investigate and optionally fix concrete software failures with an evidence-first Debug Work Order. Use when the user provides or reports a reproducible error, failing test, stack trace, regression, flaky behavior, performance fault, or multiple known bugs and asks to diagnose, debug, or repair them; also use to resume an existing `.debug-workflow/*.md` work order. Do not use for designing debugging tools or methodology, ordinary feature work, general code review or speculative bug hunting, cosmetic “fixes,” active production incidents before containment, or conceptual explanations that require no investigation.
---

# Debug Workflow

Create a Debug Work Order before changing production code. The file is the deliberate activation signal for `debugging-workflow-guard`; merely loading this Skill does not activate hooks.

## Start or resume

1. Inspect the reported symptom and repository instructions without changing production code.
2. Create `.debug-workflow/<yyyyMMdd>-<short-slug>.md` with exactly one fenced `json debug-work-order/v1` block. Prefer `apply_patch` so PostToolUse can bind it to this session. If the host exposes only a file writer, create `.debug-workflow` first and then write the file.
3. Put every known bug in `bugs`; make exactly one bug active and leave the others `queued`.
4. State a main hypothesis and an independent backup hypothesis. Make each falsifiable.
5. On resume, choose one existing work order, increment `run.epoch`, set one bug active, and edit that file. Never let hooks choose among multiple work orders.

Use this initial machine block, replacing every example value:

```json debug-work-order/v1
{
  "schema": "debug-work-order/v1",
  "id": "DWO-20260808-short-slug",
  "status": "open",
  "run": {
    "epoch": 1,
    "state": "active",
    "mode": "investigate-and-fix"
  },
  "activeBugId": "BUG-001",
  "bugs": [
    {
      "id": "BUG-001",
      "summary": "specific externally visible failure",
      "goal": "fix",
      "status": "investigating",
      "priority": "high",
      "dependsOn": [],
      "duplicateOf": null,
      "rootCauseGroup": null,
      "symptom": {
        "expected": "observable expected behavior",
        "actual": "observable failing behavior",
        "reproduction": "exact command used as the original reproduction",
        "environment": "relevant runtime and fixture"
      },
      "hypotheses": [
        {
          "id": "H1",
          "statement": "main causal hypothesis",
          "falsifier": "observation that would reject H1",
          "status": "open",
          "evidenceRefs": []
        },
        {
          "id": "H2",
          "statement": "independent backup hypothesis",
          "falsifier": "observation that would reject H2",
          "status": "open",
          "evidenceRefs": []
        }
      ],
      "rootCause": {
        "status": "unknown",
        "statement": "",
        "causalChain": [],
        "evidenceRefs": []
      },
      "fix": {
        "status": "not-started",
        "firstRevision": null,
        "affectedBugIds": [],
        "summary": ""
      },
      "verification": {
        "originalReproduction": null,
        "regression": [],
        "debugCleanup": null
      },
      "attempts": [],
      "residualRisks": []
    }
  ],
  "resume": {
    "nextBugId": "BUG-001",
    "nextAction": "run the exact reproduction and observe the failure",
    "recoveryCommands": []
  }
}
```

Keep narrative notes outside the machine block. Do not add unknown JSON fields. The default work order is local-only; the hook adds `/.debug-workflow/` to `.git/info/exclude` and never edits project `.gitignore`.

Use only these lifecycle values; do not invent synonyms:

- Work order: `open`, `paused`, `closed`, `aborted`; align `run.state` as `active`, `paused`, `closed`, `closed` respectively.
- Bug: `queued`, `investigating`, `fixing`, `verifying`, `resolved`, `blocked`, `deferred`, `duplicate`, `architecture-review`.
- Hypothesis: `open`, `supported`, `falsified`.
- Root cause: `unknown`, `inferred`, `supported`.
- Fix: `not-started`, `in-progress`, `applied`, `reverted`.

Advance fields together. During investigation, keep `rootCause.status` as `unknown` or `inferred` and `fix.status` as `not-started`; never mark a hypothesis or root cause `supported` until its `evidenceRefs` contains a hook-issued receipt for this bug. Before the first production edit, use bug `fixing` plus fix `in-progress`. After the edit, use bug `verifying` plus fix `applied`. Close with bug `resolved`, work order `closed`, `run.state` `closed`, and `activeBugId` `null` only after all three verification receipt fields are populated.

## Investigate

Work one bug at a time.

1. Run its exact `symptom.reproduction` before a production mutation. Invoke that command verbatim: do not add pipes, redirections, `; echo`, `|| true`, or another wrapper, because classification and native exit status are part of the receipt. Confirm that it fails for the reported reason, not merely with a nonzero exit.
2. Locate WHERE behavior first diverges from the last known-good path, then explain WHAT component is wrong.
3. Trace values backward from the failure to their source. Compare good/bad inputs or revisions and change one variable per experiment.
4. Use tests, throwaway probes, or temporary instrumentation. Prefix retained debug markers with `DBG_<sanitized-work-order-id>_<bug-id>`.
5. Cite hook-issued receipt IDs only after inspecting their command result. A receipt proves event order and outcome, not the truth of an interpretation.
6. Mark hypotheses `supported` or `falsified` with receipt references. Set `rootCause.status` to `supported` only with a concrete causal chain and current-session evidence.

Do not patch by intuition. If the original reproduction is unavailable, keep the bug `blocked` and record the smallest action that could make it reproducible.

## Fix and verify

1. Move the active bug to `fixing`; record the supported root cause before the production edit.
2. If an independent diagnosis would materially reduce uncertainty, ask a fresh generic read-only subagent to inspect the Work Order and evidence. Describe the question in ordinary language, do not present the chosen root cause as authoritative, and treat the reply as advice that the parent must verify.
3. After three failed post-mutation reproductions, stop editing and move the bug to `architecture-review`. A fresh generic read-only subagent may challenge the architecture when useful, but the parent remains responsible for the decision and the evidence recorded in the Work Order.
4. Make the smallest causal change. Set `fix.firstRevision` on the first production mutation and list every bug affected by a shared fix in `fix.affectedBugIds`.
5. Run the exact original reproduction again after the last production mutation. It must succeed.
6. Run at least one regression check for each affected bug. Never reuse another bug's receipt.
7. Remove debug instrumentation. Run a cleanup command that exits 0 only when the marker is absent, and record its receipt.
8. Update `verification` with the successful receipt IDs, then set the bug `resolved`.

For a single-bug close, preserve the exact receipt shapes below. Receipt fields contain no prose annotations:

```json
{
  "status": "resolved",
  "fix": {
    "status": "applied",
    "firstRevision": "R-3",
    "affectedBugIds": ["BUG-001"],
    "summary": "smallest causal change"
  },
  "verification": {
    "originalReproduction": { "receiptId": "R-4" },
    "regression": [{ "receiptId": "R-5" }],
    "debugCleanup": { "receiptId": "R-6" }
  }
}
```

Then set top-level `status` to `closed`, `run.state` to `closed`, and `activeBugId` to `null`. Replace every example receipt with the actual hook-issued ID; never write strings such as `"R-3 (first mutation)"` or use a bare `"R-4"` where a receipt-reference object is required.

After three post-mutation reproduction failures, stop editing that bug. Move it to `architecture-review`, write the failed attempts and the architectural decision or new falsifiable hypothesis, then either resume it or activate another bug.

## Coordinate multiple bugs

- Append newly discovered defects as `queued`; do not silently widen the active bug.
- Use `dependsOn` for ordering, `duplicateOf` plus `duplicate` for duplicates, and the same `rootCauseGroup` for shared causes.
- Before a shared production edit, activate each affected bug one at a time and run its exact failing reproduction, then switch back to the fix owner. A command for a non-active bug is still attributed to the active bug and does not establish that other bug's baseline.
- A shared fix may name several `affectedBugIds`, but rerun each bug's own reproduction and regression after the mutation before resolving it.
- Keep exactly one bug in `investigating`, `fixing`, or `verifying`. Switch `activeBugId` only in the work order so subsequent receipts cannot mix bugs.
- Use separate work orders for truly parallel sessions. One work order has one live session lease.

## End a turn

Before any response that ends the turn:

- For completed work, make every accepted bug terminal, set the work order and run to `closed`, and cite the work-order path in the response.
- For interruption or external blockage, change the active bug to `blocked`, `deferred`, or `architecture-review`; set work-order `status` and `run.state` both to `paused`; provide `resume.nextBugId`, a concrete `resume.nextAction`, and recovery commands; cite the path.
- Never invent receipt IDs or claim that hook activation alone established debugging effectiveness.
