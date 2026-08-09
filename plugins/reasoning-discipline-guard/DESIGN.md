# reasoning-discipline-guard design

## Responsibility

The plugin turns a Skill-created file into a durable activation signal, requires five observable stage transitions, and prevents an activated workflow from ending without a valid pause, abort, or receipt-bound conclusion.

Its hard claim is deliberately narrow: an activated conclusion cannot pass Stop unless the current files establish the configured structural and ordering contract. Receipt issuance, formatting compliance, and extra model turns are not evidence that the answer is correct.

## Causal chain

```text
broad Skill route
  → workflow.md written alone
  → hook binds workspace + workflow id + epoch
  → five separate PostToolUse events
  → branch validators + reference checks
  → receipt and SHA-256 chain
  → workflow closes with RD-R5
  → Stop recomputes files and permits conclusion
```

The file write, rather than Skill loading or a prompt regex, is the activation boundary. This avoids blocking simple questions when a broad Skill description is considered but not used.

## Branches

- `exact` requires an ordered quantifier model, dependent derivations, a boundary/counterexample attack, a dedicated quantifier-order attack, and an independent derivation or deterministic solver check. This makes participant/environment role inversions observable, while still stopping short of claiming that the resulting mathematics is true.
- `causal` requires observations, at least two falsifiable hypotheses, a discriminating test, an alternate-hypothesis/counterfactual attack, and a controlled or independent causal check.
- `decision` requires objectives, constraints, at least two options, criteria/evaluations, a failure-mode/sensitivity attack, and sensitivity or scenario analysis.

The branch registry is the only intended extension seam. A future branch must define its analysis, challenge, and cross-check validators and add route and acceptance cases before entering the public enum.

## State and integrity

Hook state is stored under the host plugin-data directory and keyed by the hash of session id plus workspace. It contains the bound path, immutable workflow id and branch, epoch, ordered receipts, claim IDs, and file digests.

The manifest and each stage require exactly one canonical fenced JSON block. Unknown fields are rejected. A prior-stage rewrite truncates downstream receipts. Stop reloads every file and recomputes its digest, so a stale or manually forged `completionReceipt` is insufficient.

A later session resumes by incrementing the manifest epoch and declaring the first incomplete stage. Binding revalidates the complete earlier prefix and reconstructs its deterministic receipt IDs with fresh digests; an invalid prefix fails closed instead of skipping work.

Corrupt or expired plugin state fails open to idle rather than permanently trapping unrelated work. A readable bound manifest fails closed until corrected, paused, or aborted.

## Privacy boundary

Artifacts contain concise premises, claims, tests, and conclusions. They are not a request to reveal private token-level reasoning. Narrative outside the machine block is optional and never treated as proof.

## Non-goals

- Automatically activating from prompt keywords
- Blocking production or business-file edits
- Proving semantic truth, optimality, or causal validity
- Replacing deterministic solvers, tests, measurements, or authoritative sources
- Persisting the artifact directory in project version control by default
