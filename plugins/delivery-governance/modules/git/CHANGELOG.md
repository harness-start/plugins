# Changelog

## [Unreleased]

- Remove the undocumented process-receipt allowance path; worktree creation now depends only on an explicit user request or repository configuration.

## [0.4.0] - 2026-08-19

- Deny unsolicited `git worktree add` and observable host `isolation: worktree` by default.
- Allow creation only after an explicit user isolation request or `checks.worktreeCreate: "allow"`.

## [0.3.0] - 2026-08-08

- Ignore standalone `=======` lines unless the file also contains a merge-conflict boundary marker, avoiding false positives on RST table borders and similar document syntax.

## [0.2.0] - 2026-08-07

- Reintroduce a Git-only delivery guard with strict local command and repository-state policies.
- Own final-file merge conflict marker detection and its project-level modes and overrides.
- Add safe stale-lock handling, commit boundaries, offline tests, and dual-host acceptance coverage.
- Exclude GitHub, GitLab, CI, SVN, and remote delivery completion responsibilities.
