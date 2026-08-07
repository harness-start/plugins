# Changelog

All notable changes to this plugin are documented in this file.

## [0.5.1] - 2026-08-08

### Changed

- `sed-inplace`: allow unbacked `sed -i` / `sed --in-place` when **every** file operand is under `/tmp/`, `/private/tmp/`, or `$TMPDIR/` / `${TMPDIR}/` (aligned with cat heredoc temp paths). Repo paths and mixed targets still deny.

## [0.5.0] - 2026-08-07

### Changed

- Moved SQL BOM and invalid UTF-8 enforcement to the dedicated `encoding-guard` plugin.
- Kept the PostToolUse file-safety engine focused on TLS bypass and direct PII logging reports.

## [0.4.0] - 2026-08-06

### Added

- Plugin skill `skills/command-safety-guards-config` to initialize, edit, and diagnose `.command-safety-guards.mjs` project config (with example reference).

## [0.3.0] - 2026-08-06

### Added

- Project config file `.command-safety-guards.mjs` (also `.cjs` / `.js`) with declarative `rules` and `settings.engines`.
- Built-in rule table in `scripts/lib/builtin-rules.mjs` for sed / cat heredoc / Redis / SQL / active-test / secret-leak / lark (user rules prepend; first match wins).
- `DESIGN.md` documenting discovery order, fields, priority, fail-open, and engine boundaries.
- Configurable deny-escalation `windowMinutes` and `threshold`.

### Changed

- PreToolUse entry orchestrates config load → engines → rule match instead of hard-coded check chains only.
- Pattern-based checks live only in `builtin-rules.mjs`; non-regex engines live under `scripts/engines/`.

### Removed

- Dual-track `scripts/checks/{sed-inplace,cat-write,advanced-command,dangerous-command,secret-read,file-safety}.mjs` compatibility wrappers.

## [0.2.0] - 2026-08-06

### Added

- Database SQL, Redis, MySQL replication preflight, and SQL encoding checks.
- Bounded active-security-test checks, Lark confirmation audit, secret read/leak reports.
- Net-new insecure TLS and log PII reports.
- Plugin-local deny escalation state under `PLUGIN_DATA`/`CLAUDE_PLUGIN_DATA`.

## [0.1.0] - 2026-08-06

### Added

- Dual-platform PreToolUse guard for dangerous recursive deletion, unbacked `sed` in-place edits, and `cat` heredoc file writes.
- Offline unit coverage and Docker-based live Claude Code/Codex acceptance.
