# Design

## Causal contract

```text
known behavior mismatch
  -> Skill designs primary + challenges + invariant
  -> explicit contract mutation activates one leased run
  -> exact direct commands + literal signatures produce BEFORE receipts
  -> production bytes diverge from baseline
  -> unchanged verification bytes + exact commands produce AFTER receipts
  -> Stop recomputes fingerprints and validates every receipt reference
  -> close is accepted only for fresh evidence on current bytes
```

Hook activation alone is not evidence of effectiveness. Outcome-level evidence is the conjunction of required literal output, an explicit outcome basis, immutable plan digest, command hash, production fingerprint, verification fingerprint, case id, phase, contract id, and run epoch. Claude receipts normally bind an exit status or failure event. Codex unified execution currently exposes the exact command and raw response text to `PostToolUse`, but not the exit status; those receipts are marked `literal-oracle` and rely on phase-specific signatures in frozen verification assets. The plugin never represents that weaker signal as an observed exit status.

## Trigger boundary

- Skill metadata may route known bug, regression, compatibility, and behavior-change requests.
- Skill loading is guidance only.
- A file-tool mutation of a valid `.behavioral-regression/BR-*.json` is the only hard activation seam.
- `SessionStart` performs bounded discovery without binding.
- No prompt scanning, completion-language scanning, generic shell inference, or pre-tool interception is used.

## Failure policy

- No bound contract: exact no-op.
- Idle discovery/runtime error: stderr diagnostic, fail open.
- Bound missing/malformed contract or corrupt state: Stop fails closed.
- `paused` and `aborted`: release closure while retaining a recovery path.
- Timeout, unknown outcome, missing command, and hook error never count as RED or GREEN.
- A Codex response without exit status counts only when a phase-specific literal oracle matches; its receipt is labeled `literal-oracle` rather than exit-status evidence.
- At least one primary case must transition from failure to success, and every outcome-changing case must declare distinct BEFORE/AFTER literal signatures.

## Integrity boundaries

- Production and verification scopes are bounded explicit regular files; traversal, duplicates, absolute paths, and symlinks are rejected.
- BEFORE is accepted only at the activation production fingerprint.
- The first BEFORE freezes verification assets; any later byte change clears receipts and invalidates the run.
- AFTER binds the modified production fingerprint; a later source edit makes it stale.
- Plan changes before source mutation reset receipts; plan changes after mutation require a revert or abort.
- A shared run record provides one active lease. A one-step epoch resume retains valid BEFORE receipts and clears AFTER receipts.
