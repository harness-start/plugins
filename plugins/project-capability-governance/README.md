# project-capability-governance

This dual-host plugin captures hard-qualified project capability proposals through one recorder subagent per user-prompt epoch. Its Stop Hook emits a deduplicated, human-only notice and never blocks current or later work.

The causal chain is explicit: `SessionStart` publishes a reservation command,
the root records a standalone request for the current prompt epoch, and the
next `SubagentStart` consumes that reservation and injects both the recorder
contract and request. This is necessary on Codex because
`collaboration.spawn_agent` emits `SubagentStart`/`SubagentStop` but does not
expose the spawn message in the child context when `fork_turns: "none"`.

Claude Code provides a dispatch `PreToolUse` event, so duplicate recorder
dispatch can be rejected before startup. Codex 0.146 does not emit that
dispatch event; singleton behavior is therefore established at
`SubagentStart`, where only the first reserved child is bound. Codex's built-in
custom `apply_patch` also does not emit `PreToolUse`, so this plugin does not
claim a Codex-wide file-write sandbox. The dual-host acceptance gate proves the
recorder outcome—one bound child creates a schema-valid proposal and triggers
the human notice—rather than treating hook activation as success.

Humans explicitly invoke `$project-capability-governance` to review one proposal at a time. Accepted instructions, Skills, Scripts, and Hooks are written to the current project's Claude Code and Codex configuration. Proposal Markdown is deleted after a verified acceptance, explicit rejection, or completed duplicate merge; deferred and blocked applications remain.

Run the local tests from the repository root:

```bash
node --test plugins/project-capability-governance/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin project-capability-governance
```
