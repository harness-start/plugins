# Changelog

## [0.1.1] - 2026-08-09

### Changed

- Stop creating or modifying the audited repository's `.gitignore`.
- Deny `create_file` and `search_replace` writes under the audit root.
- Treat interpreter commands as mutations only when they open or write the trail, not when they only read it.

## 0.1.0

- Initial release of project-local subagent lifecycle recording and trail protection.
