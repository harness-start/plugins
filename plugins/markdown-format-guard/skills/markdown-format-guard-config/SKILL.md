---
name: markdown-format-guard-config
description: Change markdown-format-guard heading/fence/whitespace rules or investigate format findings via .markdown-format-guard.mjs.
version: 0.1.0
---

# markdown-format-guard-config

Manage the project configuration consumed by the `markdown-format-guard` PostToolUse hook and diagnose its findings.

Authoritative schema: the plugin's sibling `DESIGN.md`. Read it before changing configuration.

## Config discovery

Resolve the active Git root with `git rev-parse --show-toplevel`. Load the first existing file only:

1. `.markdown-format-guard.mjs` (preferred)
2. `.markdown-format-guard.cjs`
3. `.markdown-format-guard.js`

Do not create a second config when one already exists. Missing or broken config makes the hook fall back to built-ins; report broken config instead of silently leaving it ineffective.

## Schema

```js
export default {
  checks: {
    headingIncrement: "block", // block | report | off
    headingStyle: "block",
    headingSpace: "block",
    emptyHeading: "block",
    headingBlankLines: "block",
    hardTabs: "block",
    trailingWhitespace: "block",
    multipleBlankLines: "block",
    finalNewline: "block",
    fencedCodeClosed: "block",
    fencedCodeLanguage: "report",
    singleH1: "off",
  },
  overrides: [
    {
      match: /^CHANGELOG\.md$/i,
      checks: { headingIncrement: "off", singleH1: "off" },
    },
  ],
};
```

| Field | Type | Contract |
| --- | --- | --- |
| `checks.<name>` | `"block"` \| `"report"` \| `"off"` | Optional; missing keys keep defaults |
| `overrides[].match` | `RegExp` | Required; repo-relative paths with `/` |
| `overrides[].checks` | object | Per-check mode overrides; first match wins per check |

Do not invent new check names or ignored fields.

## Workflow

1. Classify the operation as init, show, add/edit/remove override, change default mode, or diagnose finding.
2. Locate and read the complete existing config before editing.
3. Prefer narrow path overrides over globally turning a check `off`.
4. Validate the loaded module after editing.
5. Report the config path, effective modes for a sample path, and changed keys.

For initialization, create only this minimal file:

```js
// Optional overrides for markdown-format-guard; omitted checks use built-in defaults.
export default {
  checks: {},
  overrides: [
    // { match: /^docs\/legacy\//, checks: { headingBlankLines: "report" } },
  ],
};
```

## Finding diagnosis

- Read the file at the reported line; fix only the listed check.
- Fence interiors and YAML front matter are out of heading scope by design.
- Exactly two trailing spaces are intentional hard breaks; do not strip them when fixing other lines.
- The plugin never rewrites files; the agent must apply the fix.

## Validation

```bash
node --input-type=module -e '
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(process.argv[1]).href);
const cfg = mod.default ?? mod;
if (!cfg || typeof cfg !== "object") throw new Error("default export missing");
const names = new Set([
  "headingIncrement","headingStyle","headingSpace","emptyHeading","headingBlankLines",
  "hardTabs","trailingWhitespace","multipleBlankLines","finalNewline",
  "fencedCodeClosed","fencedCodeLanguage","singleH1",
]);
for (const [k, v] of Object.entries(cfg.checks ?? {})) {
  if (!names.has(k)) throw new Error("unknown check " + k);
  if (!["block","report","off"].includes(v)) throw new Error("bad mode " + k);
}
for (const [i, o] of (cfg.overrides ?? []).entries()) {
  if (!(o.match instanceof RegExp)) throw new Error("override[" + i + "].match");
}
console.log("ok");
' "$(git rev-parse --show-toplevel)/.markdown-format-guard.mjs"
```

Do not commit unless the user asks.

## Anti-patterns

- Turning off `headingIncrement` or `fencedCodeClosed` for the entire repository without a written reason.
- Expecting full markdownlint MD* parity or external CLI behavior.
- Auto-formatting the whole document to silence one line finding.
- Creating a second config file alongside an existing one.

## Reference

- Example overrides: `references/example-config.mjs` in this skill directory.
- Plugin design: sibling `DESIGN.md` at the plugin root.
