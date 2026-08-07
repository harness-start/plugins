# Changelog

## 0.1.0

- Initial release: PostToolUse Markdown format guard for Claude Code and Codex.
- Built-in checks for heading increment/style/spacing/blank lines, tabs, trailing whitespace, multiple blank lines, final newline, fenced code closed/language, optional single H1.
- Project config via `.markdown-format-guard.mjs` with per-check `block|report|off` and path overrides.
- Bundled `markdown-format-guard-config` skill and dual-host acceptance case scaffold.
