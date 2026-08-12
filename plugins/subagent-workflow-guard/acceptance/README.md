# subagent-workflow-guard host acceptance

`cases/` starts real Claude Code and Codex sessions in the repository's Docker acceptance environment.

| Case | Behavior |
| --- | --- |
| `01-application-dispatch` | Proves Claude's matched `Agent` dispatch is denied before `SubagentStart`, and reproduces the Codex 0.146 namespaced collaboration boundary with a real spawned-subagent session receipt |

From the repository root:

```bash
./scripts/acceptance/run.sh --plugin subagent-workflow-guard
```

The case is intentionally outcome-level: a loaded Hook or injected sentence is not enough. Claude must show the guard-owned denial receipt and no `SubagentStart`. Codex must show a structured spawned-subagent `session_meta` receipt; that is evidence of the known host limitation, not a successful hard gate.

Codex 0.146 does not emit dispatch `PreToolUse` for the namespaced
`collaboration.spawn_agent` API, but it does emit `SubagentStart` and
`SubagentStop`. The plugin therefore does not claim a Codex pre-dispatch hard
gate: an unreserved child can start, after which `SubagentStart` records it as
an orphan and injects recovery context. Its other Codex value is application
tooling, Result Card fixtures for hook-capable seams, and deterministic
completion-graph validation. This boundary is observed in Docker host traces
and remains explicit rather than being hidden by a weaker assertion.
