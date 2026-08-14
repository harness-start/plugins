# file-access-audit host acceptance

Cases under `cases/` run real Claude Code and Codex sessions through `scripts/acceptance/run.sh`. Live runs are Docker-only.

| Case | Behavior |
| --- | --- |
| `01-record-file-write` | Edits a source file; expects a project-local JSONL row and audit-local `.gitignore` without changing the project `.gitignore` |

Run from the repository root:

```bash
./scripts/acceptance/run.sh --plugin file-access-audit
```

Honesty only (no Docker or API):

```bash
./scripts/acceptance/run.sh --honesty-only
```

See [host acceptance documentation](../../../docs/host-acceptance.md).
