---
name: file-line-budget-guard-config
description: >
  Initialize, inspect, edit, and diagnose the project-root
  .file-line-budget-guard.mjs (or .cjs/.js) config for the file-line-budget-guard
  plugin. Use when the user wants to create or change line-budget rules, skip
  paths, report-only budgets, ratchet settings, fix invalid config, or asks
  about file-line-budget-guard configuration / 行数预算配置 / 棘轮配置.
  Triggers: /file-line-budget-guard-config, "budget config", "行数预算配置",
  ".file-line-budget-guard.mjs".
version: 0.1.0
---

# file-line-budget-guard-config

Manage the **project** config file consumed by the `file-line-budget-guard` PostToolUse hook.

Authoritative schema: plugin `DESIGN.md` (same plugin package). Prefer that over memory.

## Config discovery

Resolve project root with `git rev-parse --show-toplevel` from the active workspace cwd.

Load priority (first existing file wins — do not invent a second config):

1. `.file-line-budget-guard.mjs` ← prefer for new files
2. `.file-line-budget-guard.cjs`
3. `.file-line-budget-guard.js`

Hook loads via dynamic `import()` of `export default { rules, settings }`.
Missing / broken config → hook falls back to built-in rules (fail-open). Skill must **report** broken configs, not leave them silently wrong.

## Schema (user config)

```js
export default {
  rules: [
    // First match wins. User rules are prepended to built-ins at runtime.
    { match: /(^|\/)tests?\//, mode: "skip" },
    { match: /\.tsx?$/, budget: 500, mode: "block" },
    { match: /(^|\/)Dockerfile$/, budget: 500, mode: "report" },
  ],
  settings: {
    nearBudgetWarnRatio: 0.8,      // warn when lines >= budget * ratio
    warnCooldownMinutes: 30,
    oversizeSoftGrowthLimit: 20, // historical oversize soft growth lines
  },
};
```

| Field | Type | Rules |
| --- | --- | --- |
| `match` | `RegExp` literal | Required. Tested against path **relative to repo root** (posix `/`) |
| `mode` | `"block"` \| `"report"` \| `"skip"` | Default `"block"` if omitted |
| `budget` | positive number | Required unless `mode: "skip"` |

**Do not** invent fields the hook ignores. **Do not** put comments that break ESM parse.

## Workflow

### 0. Intent

Classify the user request into one or more ops:

| Op | When |
| --- | --- |
| `init` | No config, or user asks to scaffold |
| `show` | Explain current effective intent of file |
| `add-rule` / `edit-rule` / `remove-rule` | Change `rules` |
| `set-settings` | Change `settings` keys only |
| `diagnose` | Invalid file, hook weirdness, unexpected allow/deny |

Ask at most one clarifying question when path/mode/budget are ambiguous; otherwise assume reasonable defaults and state them.

### 1. Locate and read

1. Resolve git root; if not a git repo, use workspace root and **state that** (hook may not find config either).
2. List which config file exists (if any).
3. Read the full file before editing.

### 2. `init` (no file)

Create **only** `.file-line-budget-guard.mjs` at repo root with a minimal, reviewable starter — not a dump of all built-ins (built-ins already apply when unmatched).

Minimal template:

```js
// .file-line-budget-guard.mjs
// User rules are prepended to file-line-budget-guard built-ins (first match wins).
export default {
  rules: [
    // Project overrides go here, e.g.:
    // { match: /^src\/legacy\//, budget: 800, mode: "block" },
    // { match: /(^|\/)generated\//, mode: "skip" },
  ],
  settings: {
    nearBudgetWarnRatio: 0.8,
    warnCooldownMinutes: 30,
    oversizeSoftGrowthLimit: 20,
  },
};
```

If the user already has policy preferences (language budgets, skip dirs), encode them as concrete rules in the same write.

### 3. Edit rules safely

- **Prepend** more specific overrides near the **top** of `rules` (they win over later user rules and all built-ins).
- Prefer narrow `match` (path prefix / exact file) over broad `/.*/`.
- `mode: "skip"` for tests/fixtures/generated only when the user wants no budget enforcement.
- `mode: "report"` for linear build recipes when warn-only is intended.
- Never “fix” a deny by silently raising budget past 2000 without explicit user confirmation.
- Keep `match` as real `RegExp` literals in the source file (not strings).

### 4. `diagnose`

Check and report:

1. File exists at expected name/order?
2. Valid ESM with `export default` object?
3. Each rule: `match instanceof` RegExp after load; mode in set; budget positive when not skip?
4. Overlapping user rules (same paths hit twice) — warn first-match winner.
5. Settings keys types (numbers, finite, positive where required).

Optional verification (when node available):

```bash
node --input-type=module -e '
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(process.argv[1]).href);
const cfg = mod.default ?? mod;
if (!cfg || typeof cfg !== "object") throw new Error("default export missing");
for (const [i, r] of (cfg.rules ?? []).entries()) {
  if (!(r.match instanceof RegExp)) throw new Error("rules["+i+"].match not RegExp");
  const mode = r.mode ?? "block";
  if (!["block","report","skip"].includes(mode)) throw new Error("rules["+i+"].mode");
  if (mode !== "skip" && (!(typeof r.budget === "number") || r.budget <= 0))
    throw new Error("rules["+i+"].budget");
}
console.log("ok", (cfg.rules ?? []).length, "rules");
' /path/to/.file-line-budget-guard.mjs
```

### 5. Deliver

- Show a short summary: path, ops applied, rule ids/matches changed.
- Remind: user rules prepend built-ins; unmatched paths still use plugin built-ins; no config ⇒ built-ins only.
- Do not commit unless the user asks.

## Anti-patterns

- Copying the entire built-in table into the project file “for completeness”.
- Using string patterns (`"\\.ts$"`) instead of `/\\.ts$/`.
- Putting config outside repo root.
- Disabling protection by `mode: "skip"` on `src/` without explicit user request.
- Editing plugin install directory or `BUILTIN_RULES` inside the plugin package for a single project need.

## Reference

- Plugin DESIGN: `${CLAUDE_PLUGIN_ROOT}/DESIGN.md` or sibling `DESIGN.md` in this plugin.
- Example snippets: `references/example-config.mjs` in this skill directory.
