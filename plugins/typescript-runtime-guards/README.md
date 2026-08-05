# TypeScript Runtime Guards

TS/JS lockfile deny + encoding/debt/as-any/suppression reports

## Events

- **PreToolUse**: deny direct lockfile writes (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`, `deno.lock`, `npm-shrinkwrap.json`)
- **PostToolUse**: report encoding issues, net-new debt signals, best-effort syntax

## Version

0.1.0
