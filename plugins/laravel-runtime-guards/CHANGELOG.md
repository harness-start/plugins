# Changelog

All notable changes to this plugin are documented in this file.

## [0.1.0] - 2026-08-05

### Added

- Initial release: Laravel env-detector migrated from
  `infra/harness-starter`.
- UserPromptSubmit context injection (once per session, 24h cooldown,
  sessionId:cwd keyed) with prompt signal filtering and question-only skip.
- Tests: 7 `node --test` cases (pure unit tests; no model/CLI invocations).
