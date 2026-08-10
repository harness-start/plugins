# compact-context-journal host acceptance

Cases under `cases/` run real Claude Code and Codex sessions through the shared
Docker-only acceptance harness.

| Case | Behavior |
| --- | --- |
| `01-protect-session-journal` | Archives the live prompt, admits it before a tool call, and denies structured replacement of the session journal |

Run from the repository root:

```bash
./scripts/acceptance/run.sh --plugin compact-context-journal
```

The exact compact lifecycle is covered by offline hook-sequence tests because the
non-interactive host harness does not expose an interactive `/compact` boundary.
The live case verifies real host registration, prompt capture, admission, and
append-only protection.
