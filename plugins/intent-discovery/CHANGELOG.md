# Changelog

## 0.1.1

- Store session state under the workspace `.grill-ledgers/.state/` instead of host `PLUGIN_DATA`.
- Key files by session id in the current working directory, not the parent git root.
- Deny agent writes to that directory; ledger notes remain writable.

## 0.1.0

- Initial release: grill-me hooks design v3.1 as dual-host plugin.
- UserPromptSubmit entry/classify, PreToolUse write-block, Stop complete-option parse.
- Unit tests for classify matrix, write deny/allow, complete/abort/fail-open.
