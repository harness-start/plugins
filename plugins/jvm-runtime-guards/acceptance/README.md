# jvm-runtime-guards host acceptance

| Case | Behavior |
| --- | --- |
| 01-deny-lockfile | PreToolUse deny writing `gradle.lockfile` |

```bash
./scripts/acceptance/run.sh --plugin jvm-runtime-guards
```
