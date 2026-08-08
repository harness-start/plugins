# Debugging Workflow Guard

`debugging-workflow-guard` provides a narrow `debug-workflow` Skill and hook-backed evidence workflow for concrete software failures. It is language-agnostic and supports several bugs without mixing their evidence.

The Skill handles intent. Hooks do not classify prompts and Skill loading alone is inert. A session becomes active only after it creates or resumes a valid `.debug-workflow/*.md` Debug Work Order.

## Causal chain

```text
concrete failure request
  -> debug-workflow Skill creates/resumes a valid Work Order
  -> PostToolUse binds that exact file + epoch to the session
  -> command and mutation receipts are attributed to activeBugId
  -> PreToolUse requires exact failing baselines + causal evidence and freezes a bug after three failed fix cycles
  -> Stop checks closed claims against current-session receipts; paused orders remain honest handoffs
```

The guard establishes workflow evidence and ordering. It cannot prove that a hypothesis is scientifically correct; the agent must inspect command output and record a falsifiable causal explanation.

## Activation and storage

- SessionStart reports resumable work orders but never activates one.
- Creating any valid work order records workflow entry; only open/active orders acquire a mutation-guard lease.
- Resuming from another session requires an increased `run.epoch` and a free or expired lease.
- Default work orders are excluded through `.git/info/exclude`; project `.gitignore` is untouched.
- Plugin state stores hashes, bounded summaries, outcomes, revisions, timestamps, and bug attribution—not raw command output.
- Lifecycle vocabularies are intentionally separate: for example, a bug is `fixing` while its fix is `in-progress`. The bundled Skill lists every accepted value and the validator repeats them in recovery errors.
- A shared production fix is allowed only after each affected bug has been activated in turn and has its own exact failing baseline. Completion freshness is scoped to that bug's relevant fix mutations, so unrelated later edits do not invalidate valid evidence.
- A transiently invalid bound work order blocks unrelated production writes but remains repairable at the same path; its id, epoch, and existing receipts cannot be silently replaced.
- `closed` orders require receipt-backed completion plus an independent debug-marker scan. `paused` and `aborted` orders require a valid recovery handoff, not fabricated completion evidence.

## Configuration

Create `.debugging-workflow-guard.mjs` at the Git root when defaults need adjustment:

```js
export default {
  mode: "block", // block | report | off
  ledger: {
    root: ".debug-workflow",
    persistence: "local", // local | tracked
    maxFiles: 40,
    maxBytes: 256 * 1024,
  },
  limits: {
    maxBugs: 50,
    maxHypothesesPerBug: 20,
    maxFailedFixAttempts: 3,
    leaseMinutes: 120,
    maxReceipts: 200,
  },
  commands: {
    reproductionPatterns: [],
    verificationPatterns: [],
    expectedFailurePatterns: [],
    expectedSuccessPatterns: [],
  },
  paths: {
    codePatterns: [],
    testPatterns: [],
    diagnosticPatterns: [],
    nonCodePatterns: [],
  },
};
```

Regex patterns are JavaScript regular expressions without delimiters. Invalid patterns never match.

## Limits

- The guard sees hook events, not full semantic truth.
- Shell mutation detection is conservative; prefer file tools for traceable edits.
- Codex reports command failures through PostToolUse responses; Claude additionally exposes PostToolUseFailure.
- Standard hosts receive structured PostToolUse context. For Codex 0.146 with the repository's DeepSeek provider, the hook uses a nonzero stderr signal after persisting the receipt; this avoids the provider bug that otherwise replaces the original tool result.
- V1 deliberately disallows concurrent sessions on one work order.
