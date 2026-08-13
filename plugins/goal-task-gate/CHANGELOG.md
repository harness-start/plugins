# Changelog

## 0.1.2

- Store session state under the workspace `.goal-task/.state/` instead of host `PLUGIN_DATA`.
- Key files by session id in the current working directory, not the parent git root.
- Deny agent writes to that directory; decision trails remain append-only via the log helpers.

## [0.1.1] - 2026-08-09

### Changed

- Stop creating or modifying the audited repository's `.gitignore`.

## 0.1.0

- Initial release: `/goal <prompt>` arm, supersede, clear; append-only decisions trail with tip window; `GOAL_TASK_DONE` completion trailer; dual-host hooks.
- Harden shell PreToolUse: pure helper allowlist only; detect writeFileSync/sed -i/rm compounds; load project config in log helpers; host acceptance cases claim arm/deny/trailer (clear/supersede offline+unit).
