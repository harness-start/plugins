# Changelog

## 0.1.3

- Fall back to `HOME/.codex` when `CODEX_HOME` is unset, preserve parent/child review mapping, and make canonical challenger identity failures observable without affecting unrelated agents.
- Ship a read-only Claude plugin challenger and bounded Codex reviewer guidance.

## 0.1.2

- Map verified Codex challenger child-session events to the parent ledger session, restoring automatic nonce/evidence injection and review recording.

## 0.1.1

- Store session state under the workspace `.first-principles/.state/` instead of host `PLUGIN_DATA`.
- Key files by session id in the current working directory, not the parent git root.
- Deny agent writes to that directory; ledger files remain writable.

## 0.1.0

- Initial release: explicit first-principles entry, write barrier, on-disk ledger schema gate, dual-host hooks.
