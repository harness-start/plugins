---
name: command-safety-guards-config
description: Change or diagnose project command-safety-guards rules: shell allow/deny/report patterns, engines, and deny-escalation in .command-safety-guards.mjs.
version: 0.1.0
---

# command-safety-guards-config

Manage the **project** config file consumed by the `command-safety-guards` Pre/PostToolUse hooks.

Authoritative schema: plugin `DESIGN.md` (same plugin package). Prefer that over memory.

## Config discovery

Resolve project root with `git rev-parse --show-toplevel` (hook uses event cwd then git root).

Load priority (first existing file wins):

1. `.command-safety-guards.mjs` ← prefer for new files
2. `.command-safety-guards.cjs`
3. `.command-safety-guards.js`

Hook loads via dynamic `import()` of `export default { rules, settings }`.
Missing / broken config → built-in rules + default engines (fail-open). Skill must **surface** broken configs.

## Schema (user config)

```js
export default {
  rules: [
    // User rules prepend built-ins; first match wins (allow | deny | report).
    {
      id: "allow-redis-flushdb-staging",
      match: /\bredis-cli\b[^\n]*\bFLUSHDB\b/iu,
      mode: "allow",
    },
    {
      id: "no-git-force-push",
      match: /\bgit\s+push\b[^\n]*--force\b/iu,
      mode: "deny",
      title: "Git Force Push Guard",
      reason: "force push rewrites remote history",
      recovery: "use --force-with-lease or a controlled process",
    },
  ],
  settings: {
    engines: {
      dangerousRm: true,
      mysqlReplicationPreflight: true,
      secretRead: true,
      fileSafety: true,
      denyEscalation: true,
    },
    escalation: {
      windowMinutes: 10,
      threshold: 3,
    },
  },
};
```

### Rule fields

| Field | Type | Notes |
| --- | --- | --- |
| `match` | `RegExp` literal | **Required for user rules.** Tested on command string after sanitize (commit `-m` / nested heredoc payloads stripped) |
| `mode` | `"deny"` \| `"report"` \| `"allow"` | Default `"deny"` |
| `id` | string | Recommended stable id |
| `title` | string | Message header |
| `reason` / `recovery` | string | Shown on deny/report |

User `match` **must** be `RegExp`. Built-in function matchers are not available in project config.

### Engines (not regex rules)

| Key | Default | Meaning |
| --- | --- | --- |
| `dangerousRm` | true | Shell-parse recursive `rm` (runs **before** declarative rules) |
| `mysqlReplicationPreflight` | true | Event-evidence check for replica mutations |
| `secretRead` | true | Sensitive Read paths |
| `fileSafety` | true | PostToolUse TLS/PII |
| `denyEscalation` | true | Same-target multi-deny window |

**Critical:** `mode: "allow"` does **not** bypass `dangerousRm` or `denyEscalation`. To relax recursive-rm protection, user must explicitly set `settings.engines.dangerousRm: false` — confirm impact first.

Built-in declarative ids (override with a **more specific** user `allow`/`deny` above them, not by editing the plugin):  
`sed-inplace`, `cat-heredoc-repo-write`, `cat-heredoc-tmp-write`, `redis-cli-risk`, `redis-cli-pressure`, `sql-destructive`, `sql-privilege`, `active-test-unbounded`, `secret-leak`, `lark-yes`.

## Workflow

### 0. Intent

| Op | When |
| --- | --- |
| `init` | Scaffold empty/minimal config |
| `show` | Summarize current rules/engines |
| `add-rule` / `edit-rule` / `remove-rule` | Change `rules` |
| `set-engines` / `set-escalation` | Change `settings` |
| `allow-false-positive` | User was blocked; add narrow `allow` |
| `diagnose` | Invalid config or unexpected block/allow |

Never add `match: /.*/` allow. Prefer the **smallest** regex that unblocks the real workflow.

### 1. Locate and read

1. Git root (or workspace root with warning).
2. Which config name exists.
3. Full file contents before edit.

### 2. `init`

Create only `.command-safety-guards.mjs` at repo root:

```js
// .command-safety-guards.mjs
// User rules prepend command-safety-guards built-ins (first match wins).
export default {
  rules: [
    // { id: "…", match: /…/iu, mode: "allow"|"deny"|"report", title, reason, recovery },
  ],
  settings: {
    engines: {
      dangerousRm: true,
      mysqlReplicationPreflight: true,
      secretRead: true,
      fileSafety: true,
      denyEscalation: true,
    },
    escalation: {
      windowMinutes: 10,
      threshold: 3,
    },
  },
};
```

Encode any known project policies in the same initial write when the user already stated them.

### 3. Edit rules safely

- Put **allows** and high-priority **denies** at the **top**.
- Always set `id` for new rules.
- Deny/report: fill `reason` + `recovery` (and `title` when useful).
- For false-positive unblocks: capture a **sample command** from the user and craft a tight regex; show the sample in a comment above the rule.
- Do not disable `dangerousRm` / `denyEscalation` / `fileSafety` without explicit confirmation and a one-line risk note in the reply.
- Keep regexes as literals with appropriate flags (`i`, `u` as needed).

### 4. `diagnose`

1. Correct filename under repo root?
2. ESM `export default` object parses?
3. Each user rule: `match` is RegExp; mode in `deny|report|allow`?
4. Engines values are booleans; escalation numbers positive?
5. Over-broad allows (`/.*/`, bare `/\brm\b/`) — flag as risk.
6. Remind: `allow` cannot override dangerous recursive-rm engine.

Optional load check:

```bash
node --input-type=module -e '
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(process.argv[1]).href);
const cfg = mod.default ?? mod;
if (!cfg || typeof cfg !== "object") throw new Error("default export missing");
for (const [i, r] of (cfg.rules ?? []).entries()) {
  if (!(r.match instanceof RegExp)) throw new Error("rules["+i+"].match not RegExp");
  const mode = r.mode ?? "deny";
  if (!["deny","report","allow"].includes(mode)) throw new Error("rules["+i+"].mode");
}
console.log("ok", (cfg.rules ?? []).length, "rules");
' /path/to/.command-safety-guards.mjs
```

### 5. Deliver

- Summarize path, rules added/changed, engine toggles.
- State evaluation order: escalation → dangerousRm → user+builtin rules → mysql preflight.
- Do not commit unless asked.

## Anti-patterns

- Editing plugin `scripts/lib/builtin-rules.mjs` for a single-repo exception.
- Project-wide `allow` that neuters SQL/redis/sed guards.
- String `match` values (`"rm -rf"`) instead of `RegExp`.
- Turning off all engines to “make hooks quiet”.
- Claiming `allow` overrides `rm -rf /` protection (it does not).

## Reference

- Plugin DESIGN: `${CLAUDE_PLUGIN_ROOT}/DESIGN.md` or sibling `DESIGN.md`.
- Examples: `references/example-config.mjs` in this skill directory.
