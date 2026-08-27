---
name: git-delivery-config
description: Change git-delivery project settings or commit boundary rules via .git-delivery.mjs and commit-boundaries.json.
disable-model-invocation: true
version: 0.3.0
---

# git-delivery-config

Manage the Git-root `.git-delivery.mjs` and `.ai-experts/commit-boundaries.json` consumed by `git-delivery`. Read `../../README.md` before changing either interface.

## Workflow

1. Resolve the root with `git rev-parse --show-toplevel` and read an existing configuration in full.
2. Use `.git-delivery.mjs` for `mergeConflict` modes, ordered path overrides, and repo-wide `worktreeCreate`.
3. Keep `worktreeCreate` at `block` unless the repository has chosen to allow linked worktrees. Valid values are `block`, `report`, and `allow`.
4. Use `.ai-experts/commit-boundaries.json` only to group paths that may form one atomic commit boundary.
5. Keep `mergeConflict` `block` as the default. Make `report` or `off` exceptions narrow and evidence-backed.
6. Run the plugin unit tests after schema-sensitive changes.

Do not add callbacks, custom scanners, command-rule opt-outs, remote-host settings, or reads from another plugin's configuration.
Do not treat `worktreeCreate: "allow"` as a way to bypass other Git delivery rules.
