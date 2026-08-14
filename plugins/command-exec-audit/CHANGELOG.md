# Changelog

## [0.1.2] - 2026-08-15

### Fixed

- Create `.command-exec-audit/.gitignore` for `sessions/` without creating or changing the project's root `.gitignore`.

## [0.1.1] - 2026-08-09

### Changed

- Stop creating or modifying the audited repository's `.gitignore`.

## 0.1.0

- Initial release: project-local per-session shell command JSONL trail.
- Pre pending + Post tip rewrite for duration/status; append fallback for parallel tools.
- Tip rewrite requires non-empty `tool_use_id`; parallel finishes recover `started_at` by scan.
- Default command status is `unknown` without an explicit exit/success signal.
- Session JSONL append/tip rewrite uses process locks; trail protect uses path boundaries.
- Status + duration only; no stdout/stderr capture.
- Lightweight command secret redaction and trail self-protection.
- Dual-host acceptance cases for record + protect deny.
