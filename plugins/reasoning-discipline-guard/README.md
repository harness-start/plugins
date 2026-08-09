# reasoning-discipline-guard

`reasoning-discipline-guard` publishes a short SessionStart routing contract, bundles a broad `reasoning-discipline` Skill, and enforces an ordered, file-backed analysis after that Skill deliberately creates a workflow.

The SessionStart contract asks the model to invoke the Skill for exact, causal, or consequential decision work while leaving routine requests alone. This route is guidance, not hard enforcement. With no `.reasoning-discipline/*/workflow.md` write, Stop remains idle. After activation, the workflow must produce five separately signed artifacts:

1. frame assumptions, typed strategy variables with independently fixed components, control assignments, and evidence-backed action-time observability;
2. analyze through an exact, causal, or decision contract; exact workflows must state fixed/exists/forall quantifiers in execution order and evaluate every fixed participant strategy against environment variation;
3. challenge the candidate with a branch-appropriate attack; exact control challenges must preserve the framed strategy assignment;
4. cross-check it through an independent method and independently search every allocation strategy; finite partition allocations are replayed from a bounded machine model;
5. state a calibrated conclusion.

Hooks validate structure, order, references, per-stage SHA-256 digests, and session receipts. Exact framing also checks that a given which states action-time observability is not omitted from the positive observability audit. Blocking that signal requires a `user-verbatim` given with explicit no-selection language; a model-inferred consequence cannot serve as the override. For `finite-partition-allocation`, the guard enumerates joint hidden responses and verifies the claimed optimum. A conclusion marked `exact-payload` must match the final response exactly, so strict one-value formats cannot acquire status text or explanation. Other valid artifacts do not become semantically true merely because their structure passes.

## Artifact location

```text
.reasoning-discipline/<yyyyMMdd>-<short-slug>/
├── workflow.md
├── 01-frame.md
├── 02-analysis.md
├── 03-challenge.md
├── 04-cross-check.md
└── 05-conclusion.md
```

On first activation the plugin adds `/.reasoning-discipline/` to the repository-local `.git/info/exclude`. It does not edit project `.gitignore`.

## Lifecycle

- `open`: the next stage must be written before the turn can end.
- `paused`: Stop is allowed only with `resume.nextStage` and a concrete `resume.nextAction`.
- `closed`: requires current, ordered `RD-R1` through `RD-R5` receipts and `completionReceipt: "RD-R5"`.
- `aborted`: releases the workflow without permitting a verified-conclusion claim.

Changing an accepted stage invalidates it and every downstream receipt. Rewrite those files in order.

To resume a paused workflow in a later session, increment `run.epoch`, reopen the manifest, and leave `currentStage` plus `resume.nextStage` at the first incomplete stage. Binding recomputes all earlier artifacts and reconstructs only a valid receipt prefix.

## Hooks

| Event | Behavior |
| --- | --- |
| `SessionStart` | Publishes the routing contract and reports discovered workflows without binding one |
| `PostToolUse` | Binds `workflow.md`, validates one stage mutation, and issues the next receipt |
| `PostToolUseFailure` | Confirms failed artifact writes did not advance state |
| `Stop` | Blocks open, invalid, stale, or incompletely closed workflows |

There is no UserPromptSubmit classifier and no business-file write barrier. A compact or final-only response format does not waive the workflow; evidence stays in the artifacts while the final response follows the requested format.

Artifact writes must use the host's observable file channel—Codex `apply_patch` or Claude Code Write/Edit—with one artifact per call. Shell-based artifact writes cannot advance the receipt chain.

## Local verification

From the marketplace root:

```bash
node --test plugins/reasoning-discipline-guard/tests/*.test.mjs
```

Run the repository-wide validation after targeted tests:

```bash
SKIP_HOST_INSTALL=1 bash scripts/ci/validate-plugins.sh
```
