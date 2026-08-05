# JVM Runtime Guards

JVM lockfile deny + encoding/debt/syntax reports for Java/Kotlin

## Events

- **PreToolUse**: deny direct lockfile writes (`gradle.lockfile`)
- **PostToolUse**: report encoding issues, net-new debt signals, best-effort syntax

## Version

0.1.0
