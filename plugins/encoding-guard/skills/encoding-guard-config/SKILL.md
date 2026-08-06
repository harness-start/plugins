---
name: encoding-guard-config
description: >
  Initialize, inspect, edit, and diagnose the project-root .encoding-guard.mjs
  configuration for the encoding-guard plugin, or safely investigate and fix
  BOM / invalid UTF-8 findings. Use for encoding guard configuration, encoding
  pattern overrides, BOM detection, non-UTF-8 files, 错误编码, 编码守卫, or
  .encoding-guard.mjs. Triggers: /encoding-guard-config, "encoding guard config",
  "BOM 检测", "UTF-8 编码配置".
version: 0.1.0
---

# encoding-guard-config

Manage the project configuration consumed by the `encoding-guard` PostToolUse hook and diagnose its byte-level findings.

Authoritative schema: the plugin's sibling `DESIGN.md`. Read it before changing configuration.

## Config discovery

Resolve the active Git root with `git rev-parse --show-toplevel`. Load the first existing file only:

1. `.encoding-guard.mjs` (preferred for new config)
2. `.encoding-guard.cjs`
3. `.encoding-guard.js`

Do not create a second config when one already exists. Missing or broken config makes the hook fall back to built-ins; report broken config instead of silently leaving it ineffective.

## Schema

```js
export default {
  rules: [
    // First match wins; user rules precede built-ins.
    { match: /^fixtures\/legacy\//, mode: "skip" },
    { match: /\.properties$/, mode: "block" },
  ],
};
```

| Field | Type | Contract |
| --- | --- | --- |
| `match` | `RegExp` | Required; matches repo-relative paths using `/` |
| `mode` | `"block"` or `"skip"` | Defaults to `block` |

Do not invent ignored fields or use string patterns.

## Workflow

1. Classify the operation as init, show, add/edit/remove rule, diagnose finding, or repair.
2. Locate and read the complete existing config before editing.
3. Put narrow project overrides before broader rules. Use `skip` only for a known exception such as a byte-level parser fixture or a platform contract that requires BOM.
4. Validate the loaded module and each rule after editing.
5. Report the config path, changed matches/modes, and effective first-match behavior.

For initialization, create only this minimal file:

```js
// User rules precede encoding-guard built-ins; first match wins.
export default {
  rules: [
    // Project overrides go here.
  ],
};
```

Do not copy all built-ins into project configuration.

## Finding diagnosis and repair

Keep raw bytes as the source of truth. Separate BOM detection from UTF-8 validity:

- UTF-8 BOM (`EF BB BF`): removing only the first three bytes is reversible.
- UTF-16/UTF-32 BOM: the BOM identifies a candidate source encoding, but conversion still must preserve all content.
- Invalid UTF-8 without BOM: source encoding is unknown. Do not decode with replacement characters or overwrite the original while guessing.

When the source encoding is known, convert to UTF-8 without BOM, compare content at the character boundary, then rerun byte validation. If it is unknown and the content cannot be reconstructed from an authoritative source, stop and request the encoding or a clean copy.

## Validation

Validate configuration with Node.js from the repository root:

```bash
node --input-type=module -e '
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(process.argv[1]).href);
const cfg = mod.default ?? mod;
if (!cfg || typeof cfg !== "object") throw new Error("default export missing");
if (!Array.isArray(cfg.rules ?? [])) throw new Error("rules must be an array");
for (const [i, rule] of (cfg.rules ?? []).entries()) {
  if (!(rule.match instanceof RegExp)) throw new Error(`rules[${i}].match`);
  const mode = rule.mode ?? "block";
  if (!["block", "skip"].includes(mode)) throw new Error(`rules[${i}].mode`);
}
console.log("ok", (cfg.rules ?? []).length, "rules");
' "$(git rev-parse --show-toplevel)/.encoding-guard.mjs"
```

Do not commit unless the user asks.

## Anti-patterns

- Treating decoded `U+FFFD` as proof of the original byte sequence.
- Guessing GBK, Latin-1, UTF-16, or another source encoding and overwriting the only copy.
- Adding a broad `skip` for `src/`, the repository root, or every extension.
- Editing the installed plugin's built-in rules for a single project.
- Creating `.encoding-guard.mjs` alongside an existing `.cjs` or `.js` config.

## Reference

- Example overrides: `references/example-config.mjs` in this skill directory.
- Plugin design: sibling `DESIGN.md` at the plugin root.
