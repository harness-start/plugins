---
name: execution-loop-guard-config
description: >
  Initialize, inspect, edit, and diagnose the project-root
  .execution-loop-guard.mjs (or .cjs/.js) config for execution-loop-guard.
  Use when the user wants to tune edit-loop thresholds, command retry limits,
  polling budgets, exemption paths, bypass markers, or diagnose unexpected
  execution-loop reports and blocks. Triggers: /execution-loop-guard-config,
  "execution loop config", "编辑循环配置", "重试阈值", "轮询预算",
  ".execution-loop-guard.mjs".
version: 0.1.0
---

# execution-loop-guard-config

Manage the project configuration consumed by `execution-loop-guard`. The authoritative schema is the plugin sibling `DESIGN.md`; read it before editing configuration.

## Discovery

Resolve the project root with `git rev-parse --show-toplevel`. Load the first existing file only:

1. `.execution-loop-guard.mjs` — preferred for new configuration
2. `.execution-loop-guard.cjs`
3. `.execution-loop-guard.js`

Do not create a second config when one already exists. A missing or broken config leaves built-in defaults active; diagnose and report the error instead of silently weakening protection.

## Schema

```js
export default {
  checks: {
    editLoop: "block",
    failedCommandRetry: "block",
    successfulCommandRepeat: "block",
    remotePolling: "report",
  },
  editLoop: {
    reportAt: 5,
    blockAt: 20,
    windowMinutes: 30,
    exemptPaths: [/^docs\//],
  },
  commandRepeat: {
    failureReportAt: 2,
    failureBlockAt: 3,
    successReportAt: 6,
    successBlockAt: 12,
    windowMinutes: 10,
    retryBypass: /(?:^|\s)#\s*retry-ok\b/i,
  },
  polling: {
    sleepBudgetSeconds: 600,
    queryBudgetCount: 20,
    windowMinutes: 30,
    cooldownMinutes: 5,
    maxSleepPerCommandSeconds: 3600,
    whileLoopAssumedIterations: 10,
    pollBypass: /(?:^|\s)#\s*poll-ok\b/i,
  },
};
```

- Check modes are `block`, `report`, or `off`.
- All thresholds are finite integers; report thresholds must be lower than block thresholds.
- `editLoop.exemptPaths` contains RegExp literals matched against repo-relative POSIX paths and is appended to the built-in Markdown exemption.
- Bypass patterns are RegExp literals, not strings.
- Successful verification commands clear edit counts; this is built-in behavior and has no config switch.

## Workflow

1. Classify the request as `init`, `show`, `set-mode`, `set-threshold`, `add-exemption`, `set-bypass`, or `diagnose`.
2. Locate and read the entire existing config and plugin `DESIGN.md`.
3. For `init`, create only `.execution-loop-guard.mjs` with the minimal template below; do not copy every default field unless the user wants to own it.
4. Apply the narrowest change. Preserve unrelated comments, order and formatting.
5. Dynamically import the config with Node, validate field types and threshold ordering, then summarize effective changes.

Minimal init template:

```js
// Project overrides for execution-loop-guard. Unspecified values use plugin defaults.
export default {
  checks: {},
  editLoop: {
    exemptPaths: [],
  },
};
```

## Safety rules

- Do not set all checks to `off` without explicit user instruction.
- Prefer a narrow path exemption over raising the global edit threshold.
- Do not lower a block threshold below its report threshold.
- Keep remote polling `report` unless the user explicitly accepts blocking legitimate waits.
- Do not use `/.*/` exemptions or bypass patterns merely to silence one incident.
- Do not edit the installed plugin to customize a project.

## Reference

- Plugin design: `${CLAUDE_PLUGIN_ROOT}/DESIGN.md` or the sibling `DESIGN.md`.
- Complete example: `references/example-config.mjs`.
