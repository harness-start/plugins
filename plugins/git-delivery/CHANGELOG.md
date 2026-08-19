# Changelog

## 0.4.0

- Deny unsolicited `git worktree add` and observable host `isolation: worktree` by default.
- Allow creation only after an explicit user isolation request, a declared process receipt, or `checks.worktreeCreate: "allow"`.

## 0.3.0

- Ignore standalone `=======` lines unless the file also contains a merge-conflict boundary marker, avoiding false positives on RST table borders and similar document syntax.

## 0.2.0

- Reintroduce a Git-only delivery guard with strict local command and repository-state policies.
- Own final-file merge conflict marker detection and its project-level modes and overrides.
- Add safe stale-lock handling, commit boundaries, offline tests, and dual-host acceptance coverage.
- Exclude GitHub, GitLab, CI, SVN, and remote delivery completion responsibilities.
