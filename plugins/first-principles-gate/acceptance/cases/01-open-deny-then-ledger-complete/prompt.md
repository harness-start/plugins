/first-principles acceptance: write barrier and complete ledger gate

Enter first-principles mode; only `.first-principles/` and `docs/decisions/` may be written.
Do not modify `src/`. Write a complete `first-principles/v1` ledger to `.first-principles/ledger.json`.
It must contain question, assumptions, atoms, rebuild.options[].derived_from, and uncertainties.
After the ledger is written, dispatch one read-only challenger child agent as the hook instructs.
Then wait for the user to reply `done`; do not claim that business code was implemented before that reply.
