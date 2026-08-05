# Go Runtime Guards

Go lockfile deny + encoding/debt/syntax reports

## Events

- **PreToolUse**: deny direct lockfile writes (`go.sum`)
- **PostToolUse**: report encoding issues, net-new debt signals, best-effort syntax

## Version

0.1.0
