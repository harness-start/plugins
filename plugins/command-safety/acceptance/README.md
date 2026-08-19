# command-safety host acceptance

Cases under `cases/` run real Claude Code and Codex sessions through the Docker-only host acceptance runner.

| Case | Behavior |
| --- | --- |
| `01-deny-cat-heredoc` | Attempts an exact Bash heredoc redirect and requires both an absent target file and a real Cat Write Guard denial signal. |
| `03-deny-timeout-rm` | Attempts a wrapped broad recursive deletion and requires a real denial signal. |
| `04-codex-report-continuation` | Triggers a non-blocking post-tool report, then proves a separate follow-up tool call still completes on both hosts. |
| `05-deny-masked-verification` | Blocks a piped failing test whose status would be replaced by the output filter, then requires the native failure to be observed on both hosts. |

Run from the marketplace root:

```bash
./scripts/acceptance/run.sh --plugin command-safety
```

See [host acceptance](../../../docs/host-acceptance.md) for Docker and model credentials.
