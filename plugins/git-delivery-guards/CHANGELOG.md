# Changelog

## 0.2.1

- Ignore standalone `=======` lines unless the file also contains a merge-conflict boundary marker, avoiding false positives on RST table borders and similar document syntax.

## 0.2.0

- Reintroduce a Git-only delivery guard with strict local command and repository-state policies.
- Own final-file merge conflict marker detection and its project-level modes and overrides.
- Add safe stale-lock handling, commit boundaries, offline tests, and dual-host acceptance coverage.
- Exclude GitHub, GitLab, CI, SVN, and remote delivery completion responsibilities.
