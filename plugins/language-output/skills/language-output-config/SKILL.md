---
name: language-output-config
description: "Change language-output defaults: response profile, drift thresholds, tool feedback, and Stop language gate in .language-output.mjs."
disable-model-invocation: true
version: 0.3.0
---

# language-output-config

Manage the Git-root `.language-output.mjs` consumed by `language-output`. Read `../../README.md` before changing the interface.

## Workflow

1. Resolve the root with `git rev-parse --show-toplevel` and read an existing configuration in full.
2. Select one built-in `defaultProfile`: `zh-CN`, `zh-TW`, `en-US`, `ja-JP`, `ko-KR`, or `th-TH`.
3. Keep `toolFeedback: "report"` and `stop: "block"` unless the user explicitly requests a narrower policy.
4. Keep detection thresholds at `12` characters and `0.25` ratio unless observed false positives justify a bounded change.
5. Run the plugin unit tests after schema-sensitive changes.

Do not add custom callbacks, arbitrary profiles, path overrides, turn-level language state, or compatibility reads from `in-chinese`.
