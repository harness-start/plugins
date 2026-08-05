# Python Runtime Guards

Python lockfile deny + encoding/debt/syntax reports

## Events

- **PreToolUse**: deny direct lockfile writes (`poetry.lock`, `pdm.lock`, `Pipfile.lock`, `uv.lock`)
- **PostToolUse**: report encoding issues, net-new debt signals, best-effort syntax

## Version

0.1.0
