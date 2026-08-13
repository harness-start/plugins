# Changelog

## 0.2.0

- Move merge conflict marker ownership, PostToolUse behavior, and configuration to `git-delivery-guards`.
- Keep backup artifact and obvious replacement-character checks as the complete source-sanity responsibility.
- Deny `create_file` and `search_replace` writes of backup artifacts or garbled source text.
- Extract explicit shell write targets from `sed -i`, `cp`, `mv`, and `rm`, and scan those command literals for replacement characters.

## 0.1.0

- Add dual-host backup artifact and obvious replacement-character checks before file writes.
- Add final-file merge conflict marker detection after writes.
- Add project-root mode and path overrides, offline tests, and dual-host acceptance coverage.
