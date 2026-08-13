# Changelog

## 0.1.0

- Add dual-platform PreToolUse protection for dependency lockfiles and package-manager-owned directories.
- Add project-root RegExp configuration with first-match `block` and `allow` rules.
- Add symlink-aware path matching, offline tests, and dual-host acceptance coverage.
- Deny `create_file` and `search_replace` writes to protected paths.
- Extract explicit shell write targets from `sed -i`, `cp`, `mv`, `rm`, `install`, and `dd of=`; leave package-manager commands without those paths alone.
