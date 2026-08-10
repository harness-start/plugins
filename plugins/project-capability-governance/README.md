# project-capability-governance

This dual-host plugin captures hard-qualified project capability proposals through one recorder subagent per user-prompt epoch. Its Stop Hook emits a deduplicated, human-only notice and never blocks current or later work.

Humans explicitly invoke `$project-capability-governance` to review one proposal at a time. Accepted instructions, Skills, Scripts, and Hooks are written to the current project's Claude Code and Codex configuration. Proposal Markdown is deleted after a verified acceptance, explicit rejection, or completed duplicate merge; deferred and blocked applications remain.

Run the local tests from the repository root:

```bash
node --test plugins/project-capability-governance/tests/*.test.mjs
```
