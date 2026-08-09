---
name: behavioral-regression
description: Design and execute language-independent behavioral regression evidence for a known bug, regression, compatibility break, or behavior-changing fix. Use when a reproducible incorrect behavior must be repaired without weakening tests or breaking boundaries, representations, compositions, ordering, error contracts, state transitions, concurrency, or compatibility. Do not use for feature discovery or an unreproduced symptom; use a debugging workflow first when the root problem is still unknown.
---

# Behavioral Regression

Turn a known failing behavior into a bounded proof obligation before changing production files.

## Workflow

1. Confirm that the task has an observable expected/actual mismatch. If it does not, diagnose first and return only after a direct reproduction exists.
2. Read [contract.md](references/contract.md) and create one `.behavioral-regression/BR-<stable-id>.json` contract.
3. Declare every production and verification file that participates in the proof. Keep the scope narrow and explicit.
4. Define at least one primary case, two challenge cases in distinct dimensions, and one compatibility invariant. Create every probe before changing production.
5. Activate the hard workflow by writing or editing the valid contract with a file tool. Loading this Skill alone never activates hooks.
6. Run every declared command directly and exactly as stored. Do not wrap it with pipes, redirects, shell connectors, backticks, or command substitution.
7. Copy only hook-issued `BR-R*` ids into matching `receipts.before` fields. A failure proves RED only when its literal signature is present; a timeout or missing command proves nothing.
8. Change only the declared production files. Do not weaken or replace verification assets after the first BEFORE receipt.
9. Run every declared command again. Copy fresh hook-issued ids into matching `receipts.after` fields.
10. Set `status` to `closed` only after all case receipts are present and Stop accepts the current production fingerprint. Otherwise set `paused` or `aborted` with a concrete next action and direct recovery commands.

## Case selection

Use observations, not implementation guesses. Choose challenge dimensions that can falsify a superficially correct patch:

- `boundary`: empty, minimum, maximum, adjacent, or partial inputs.
- `representation`: alternate encodings, aliases, normalization forms, or serialized shapes.
- `composition`: behavior when combined with another supported operation.
- `ordering`: different valid sequences or deterministic ordering requirements.
- `error-contract`: error type, code, message shape, or failure timing.
- `state-transition`: before/after state and repeated transition behavior.
- `concurrency`: interleaving, retry, idempotency, or shared-state behavior.
- `compatibility`: an existing supported behavior that must remain unchanged.

The contract is the activation and evidence boundary. The Skill is process guidance; hooks provide receipt provenance and prevent a completion claim from relying on test weakening or stale GREEN.
