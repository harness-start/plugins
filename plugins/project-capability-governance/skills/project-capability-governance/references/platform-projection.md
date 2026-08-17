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

For a dual-host project Skill, author the confirmed project-owned content directly under both host paths. Do not search for, download, install, or invoke a Skill from the current session or an external catalog. Verify both copies have the intended platform projection before closing the proposal.

Run it from the Git root. Confirm only repository paths and the project lockfile changed. Any proposal to install the capability for the user account is a separate human decision outside this workflow.
