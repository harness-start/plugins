# Changelog

All notable changes to this plugin are documented in this file.

## [0.3.2] - 2026-08-08

### Changed

- Raise the default historical oversized-file maintenance allowance from 50 to 100 lines. This keeps the ratchet bounded while allowing cohesive algorithm changes in large legacy modules without forcing readability-damaging compression.

## [0.3.1] - 2026-08-08

### Changed

- Raise the default historical oversized-file maintenance allowance from 20 to 50 lines. Larger growth still blocks unless the project explicitly overrides the limit.
- Resolve the Git HEAD baseline from the target file's repository instead of the hook process working directory.

## [0.3.0] - 2026-08-06

### Added

- Plugin skill `skills/file-line-budget-guard-config` to initialize, edit, and diagnose `.file-line-budget-guard.mjs` project config (with example reference).

## [0.2.0] - 2026-08-05

### Added

- Regex rule table, project config file loading, DESIGN.md, block/report/skip modes, configurable ratchet settings.

## [0.1.0] - 2026-08-05

### Added

- Dual-platform PostToolUse ratchet file line budget guard.
