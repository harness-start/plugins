# Rust Runtime Guards

Rust lockfile deny + encoding/debt/debug reports

## Events

- **PreToolUse**: deny direct lockfile writes (`Cargo.lock`)
- **PostToolUse**: report encoding issues, net-new debt signals, best-effort syntax

## Version

0.1.0
