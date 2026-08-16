# Acceptance

These cases verify outcome-level behavior on both hosts without treating Skill loading or extra model turns as success.

- `01-first-principles-retry`: a retry proposal must be rebuilt around operation identity and uncertain acknowledgement, without creating workflow files.
- `02-decision-load-bearing`: a cost decision must identify the cheaper current option and the dynamically calculated crossover that would change it.

Run live cases through `scripts/acceptance/run.sh`; host sessions must remain inside `docker/host-acceptance`.
