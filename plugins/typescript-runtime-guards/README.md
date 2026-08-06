# TypeScript Runtime Guards

TS/JS lockfile deny + encoding/debt/as-any/suppression reports

## Events

- **PreToolUse**: deny direct lockfile writes (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`, `deno.lock`, `npm-shrinkwrap.json`)
- **UserPromptSubmit**: inject consolidated `javascript-env-detector`, `typescript-env-detector`, `deno-env-detector`, and `typescript-nestjs-env-detector` facts once per day
- **PostToolUse**: report encoding issues, net-new `any`/suppression debt, best-effort syntax, and local `typescript-lint-eslint` output

## Version

0.1.0
