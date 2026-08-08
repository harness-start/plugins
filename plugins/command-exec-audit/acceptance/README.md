# command-exec-audit host acceptance

Cases under `cases/` run real Claude Code and Codex sessions through `scripts/acceptance/run.sh`. Live runs are Docker-only.

| Case | Behavior |
| --- | --- |
| `01-record-shell-command` | Runs a simple shell command; expects `.command-exec-audit/sessions/*.jsonl` with status and duration |
| `02-deny-trail-mutation` | Attempts to delete the audit trail via shell; expects protect deny and preserved trail root |

Run from the repository root:

```bash
./scripts/acceptance/run.sh --plugin command-exec-audit
```

Honesty only (no Docker or API):

```bash
./scripts/acceptance/run.sh --honesty-only
```

See [host acceptance documentation](../../../docs/host-acceptance.md).
