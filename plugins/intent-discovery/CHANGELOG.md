# Changelog

## [2.0.0] - 2026-08-16

- Replace the legacy `/grilling` workflow with an automatic, first-prompt discovery contract.
- Remove the three-choice interaction, business-write barrier, project configuration, and external Skill dependencies.
- Persist only bounded, platform-scoped session metadata and keep hard completion effects in the bundled Stop Hook.

## [0.1.1] - 2026-08-13

- Store session state under the workspace `.grill-ledgers/.state/` instead of host `PLUGIN_DATA`.
- Key files by session id in the current working directory, not the parent git root.
- Deny agent writes to that directory; ledger notes remain writable.

## [0.1.0] - 2026-08-07

- Initial release: grilling hooks design v3.1 as dual-host plugin.
- UserPromptSubmit entry/classify, PreToolUse write-block, Stop complete-option parse.
- Unit tests for classify matrix, write deny/allow, complete/abort/fail-open.
