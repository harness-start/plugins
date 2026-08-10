# Project platform projection

Write accepted capabilities into the current repository's host-native configuration.

## Claude Code

- Skills: `.claude/skills/<id>/SKILL.md`
- Hook scripts: `.claude/hooks/<id>.*`
- Hook registrations: merge into `.claude/settings.json`
- Instructions: root `CLAUDE.md`, subject to the repository's canonical-source rule

## Codex

- Skills: `.agents/skills/<id>/SKILL.md`
- Hook scripts: `.codex/hooks/<id>.*`
- Hook registrations: merge into `.codex/hooks.json`
- Instructions: root `AGENTS.md`

Do not make one host execute files from the other host's directory. Preserve existing JSON fields and Hook registrations. If the installed Codex runtime cannot demonstrate that a repository `.codex/hooks.json` is loaded, keep the application blocked instead of changing user-level configuration.

For a dual-host community Skill, run the project-scoped Skills CLI with both hosts selected:

```bash
DISABLE_TELEMETRY=1 npx --yes skills add <pinned-source> \
  --skill <skill-id> \
  --agent claude-code \
  --agent codex \
  --yes
```

Run it from the Git root. Confirm only repository paths and the project lockfile changed. Any proposal to install the capability for the user account is a separate human decision outside this workflow.
