# reasoning-discipline-guard

`reasoning-discipline-guard` bundles a broad `reasoning-discipline` Skill and enforces an ordered, file-backed analysis after that Skill deliberately creates a workflow.

The plugin does not activate from prompt keywords. With no `.reasoning-discipline/*/workflow.md` write, all hooks are inert. After activation, the workflow must produce five separately signed artifacts:

1. frame assumptions and strategy variables;
2. analyze through an exact, causal, or decision contract; exact workflows must state fixed/exists/forall quantifiers in execution order;
3. challenge the candidate with a branch-appropriate attack;
4. cross-check it through an independent method;
5. state a calibrated conclusion.

Hooks validate structure, order, references, per-stage SHA-256 digests, and session receipts. They do not claim that a valid artifact is semantically true or that it reproduces hidden model reasoning.

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
| `SessionStart` | Reports discovered workflows but does not bind one |
| `PostToolUse` | Binds `workflow.md`, validates one stage mutation, and issues the next receipt |
| `PostToolUseFailure` | Confirms failed artifact writes did not advance state |
| `Stop` | Blocks open, invalid, stale, or incompletely closed workflows |

There is no UserPromptSubmit classifier and no business-file write barrier.

## Local verification

From the marketplace root:

```bash
node --test plugins/reasoning-discipline-guard/tests/*.test.mjs
```

Run the repository-wide validation after targeted tests:

```bash
SKIP_HOST_INSTALL=1 bash scripts/ci/validate-plugins.sh
```
