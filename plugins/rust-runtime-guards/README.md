# Rust Runtime Guards

Rust lockfile deny + encoding/debt/debug reports

## Events

- **PreToolUse**: deny direct lockfile writes (`Cargo.lock`)
- **UserPromptSubmit**: inject consolidated `rust-env-detector` and `tauri-env-detector` facts once per day
- **PostToolUse**: report encoding, net-new debt, best-effort syntax, and `rust-debug-statement-guard` `dbg!` findings

## Version

0.2.0
