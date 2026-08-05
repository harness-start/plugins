# command-safety-guards host acceptance

Cases under `cases/` run real Claude Code and Codex sessions through the Docker-only host acceptance runner.

| Case | Behavior |
| --- | --- |
| `01-deny-cat-heredoc` | Attempts an exact Bash heredoc redirect and requires both an absent target file and a real Cat Write Guard denial signal. |

Run from the marketplace root:

```bash
./scripts/acceptance/run.sh --plugin command-safety-guards
```

See [host acceptance](../../../docs/host-acceptance.md) for Docker and model credentials.
