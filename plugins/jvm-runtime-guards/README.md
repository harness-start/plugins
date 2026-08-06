# JVM Runtime Guards

JVM lockfile deny + encoding/debt/syntax reports for Java/Kotlin

## Events

- **PreToolUse**: deny direct lockfile writes (`gradle.lockfile`)
- **UserPromptSubmit**: inject consolidated `java-env-detector` and `kotlin-env-detector` facts once per day
- **PostToolUse**: report encoding issues, net-new debt signals, best-effort Java/Kotlin syntax

## Version

0.2.0
