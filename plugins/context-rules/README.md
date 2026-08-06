# Context Rules

This plugin migrates P15 as target-native behavior. Node.js 20+ runs two checked-in `.mjs` files directly. There is no package installation, compilation, bundling, generated registry, vendored dependency tree, or copied `ai-experts` source directory.

The fourteen source hooks are consolidated by lifecycle:

- `SessionStart`: `context-injector`, `design-doc-detector`, `harness-overview-injector`, `memory-staleness-auditor`, and `telemetry-upload-session-start`. The source-only `subagent-principles-injector` contract is folded into session guidance because the target hook manifests do not expose `SubagentStart`.
- Codex `PreToolUse`: `context-rule-injector`. It reads the installed `${CODEX_HOME:-$HOME/.codex}/context-rules/index.md` and matched rule files; rule content is not copied into this plugin. Claude Code omits this Codex-only source hook.
- `UserPromptSubmit`: `feedback-reflection-reminder`, `prompt-guidance-capsule`, `skill-routing-reminder`, and `skill-trigger-telemetry-advisor-reminder`. Primer signals live in one runtime module and share cooldown and output budgets.
- `Stop`: `skill-usage-audit`, `session-runtime-feedback-reminder`, and `telemetry-upload-stop`.

State and a bounded local JSONL telemetry record live under `PLUGIN_DATA` or `CLAUDE_PLUGIN_DATA`. No state directory means stateful checks fail open. Upload is disabled unless `AI_EXPERTS_TELEMETRY_ENDPOINT` is set; configured requests have a 1.5 second timeout and never block the host on failure.
