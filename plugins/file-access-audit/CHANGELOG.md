# Changelog

## [0.1.2] - 2026-08-15

### Fixed

- Create `.file-access-audit/.gitignore` for `sessions/` without creating or changing the project's root `.gitignore`.

## [0.1.1] - 2026-08-09

### Changed

- Stop creating or modifying the audited repository's `.gitignore`.

## 0.1.0

- Initial release: project-local per-session file access JSONL trail for Claude Code and Codex.
- Structured tools only (`Read` / `Edit` / `Write` / `MultiEdit` / `NotebookEdit` / `apply_patch`).
- PreToolUse protection of `.file-access-audit/` with path-boundary shell checks.
- Session JSONL writes use process locks; optional last-line rewrite helper revalidates tip.
- Optional `.file-access-audit.mjs` config and default `.gitignore` ensure.
- Dual-host acceptance case for structured write recording.
