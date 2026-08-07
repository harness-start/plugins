---
name: git-delivery-guards-config
description: Change git-delivery-guards project settings or commit boundary rules via .git-delivery-guards.mjs and commit-boundaries.json.
version: 0.2.0
---

# git-delivery-guards-config

Manage the Git-root `.git-delivery-guards.mjs` and `.ai-experts/commit-boundaries.json` consumed by `git-delivery-guards`. Read `../../DESIGN.md` before changing either interface.

## Workflow

1. Resolve the root with `git rev-parse --show-toplevel` and read an existing configuration in full.
2. Use `.git-delivery-guards.mjs` only for `mergeConflict` modes and ordered path overrides.
3. Use `.ai-experts/commit-boundaries.json` only to group paths that may form one atomic commit boundary.
4. Keep `block` as the default. Make `report` or `off` exceptions narrow and evidence-backed.
5. Run the plugin unit tests after schema-sensitive changes.

Do not add callbacks, custom scanners, command-rule opt-outs, remote-host settings, or compatibility reads from `.source-sanity-guard.mjs`.
