# subagent-discipline

Inject a compact engineering contract into every spawned Claude Code or Codex
subagent. The contract keeps delegated work scoped, evidence-focused, and cheap
to return to the parent context.

## Behavior

The plugin registers one `SubagentStart` hook without a matcher, so it applies
to built-in and custom subagents. It injects these principles before the
subagent's first prompt:

- execute only the dispatched scope and do not delegate again;
- preserve safety, correctness, and explicit user constraints;
- return findings or changes with evidence, verification, and gaps;
- cite file conclusions with `file:line` evidence and avoid whole-file dumps;
- reuse earlier summaries instead of re-reading large files;
- omit routing, next-step, and session-reflection ceremony.

The plugin does not require a Result Card or any fixed response headings. It
also does not replace sandboxing, approvals, tool restrictions, or independent
verification.

## Platform behavior

| Platform | Hook | Plugin root |
| --- | --- | --- |
| Claude Code | `SubagentStart` | `CLAUDE_PLUGIN_ROOT` |
| Codex | `SubagentStart` | `PLUGIN_ROOT` |

Codex requires users to review and trust non-managed plugin hooks before they
run. Use `/hooks` to inspect the installed definition.

## Related controls

The following host capabilities can enforce stronger boundaries, but are not
enabled by this cross-platform plugin:

- Claude Code `PreToolUse` receives `agent_id` and `agent_type` inside a
  subagent, so a project can deny selected child-agent tool calls. Claude also
  provides `TaskCompleted` and `TeammateIdle` gates for agent teams.
- Claude agent definitions can limit `tools`, set `disallowedTools`, cap turns,
  use worktree isolation, or limit nested subagent depth.
- Codex custom agents can set `sandbox_mode`, model and reasoning defaults;
  `[agents].max_concurrent_threads_per_session` caps concurrency.
- `SubagentStop` can request another pass, but this plugin intentionally avoids
  a completion gate because it does not impose a mechanical output schema.

Official references:

- [Claude Code hooks](https://code.claude.com/docs/en/hooks)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)

## Related skills

Useful companion skills in the ai-experts catalog include
`agent-harness-design`, `code-review-loop`, `execution-loop-governance`,
`git-worktree-lifecycle`, `command-safety-governance`, and
`long-task-context-governance`.

For plan execution with fresh workers and separate specification and quality
reviews, consider
[`superpowers:subagent-driven-development`](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md).
It uses more subagent calls and review cycles, so apply it to tasks where those
gates justify the added token and coordination cost.

## Verification

From the repository root:

```bash
node --test plugins/subagent-discipline/tests/*.test.mjs
SKIP_HOST_INSTALL=1 bash scripts/ci/validate-plugins.sh
./scripts/acceptance/run.sh --plugin subagent-discipline
```
