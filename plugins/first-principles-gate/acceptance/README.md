# first-principles-gate acceptance

## Host cases (Claude + Codex)

| Case | Intent | Expected signal |
| --- | --- | --- |
| `01-open-deny-then-ledger-complete` | Full happy path | open inject + business deny + valid ledger + `完成` unlocks |
| `02-completion-claim-blocks-without-ledger` | Bare completion claim | Stop block until ledger exists |
| `03-short-alias-no-entry` | `/fp` / `$fp` are not entries | No open inject; business write not locked by this plugin |
| `04-abort-unlocks-without-ledger` | Escape hatch | `# first-principles-abort` clears barrier without ledger |
| `05-invalid-ledger-blocks-close` | Schema strictness | Present-but-invalid ledger still Stop-blocks |
| `06-soft-report-while-open` | Mid-session softness | Soft report (no Stop block); write barrier still on |

`expect.sh` must fail on inert logs (honesty gate). Case `03` asserts the **absence** of open markers while still requiring host activity.

## Offline fixtures (no live model)

Each case has `run-fixture.sh` driving the shipped hook entrypoint:

```bash
for f in plugins/first-principles-gate/acceptance/cases/*/run-fixture.sh; do
  bash "$f" || exit 1
done
```

## Entry contract under test

Legal prefix entries only:

- `/first-principles`
- `$first-principles`

Illegal by default: `/fp`, `$fp`, mid-string mentions, fenced-only tokens.
