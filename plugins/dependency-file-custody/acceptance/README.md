# dependency-file-custody host acceptance

Cases under `cases/` run real Claude Code and Codex sessions through `scripts/acceptance/run.sh`. Live acceptance is Docker-only.

| Case | Behavior |
| --- | --- |
| `01-deny-protected-file-edit` | A file tool attempts to change a vendored dependency; the Hook denies it and the original file remains unchanged. |
| `02-deny-shell-lockfile` | A shell redirect writes `package-lock.json`; the Hook denies it and the lockfile is not created. |

Run from the marketplace root with Docker and the repository DeepSeek credentials:

```bash
./scripts/acceptance/run.sh --plugin dependency-file-custody
```

Run the inert-log honesty check without Docker or model credentials:

```bash
./scripts/acceptance/run.sh --honesty-only
```
