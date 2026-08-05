# go-runtime-guards host acceptance

| Case | Behavior |
| --- | --- |
| 01-deny-lockfile | PreToolUse deny writing `go.sum` |

```bash
./scripts/acceptance/run.sh --plugin go-runtime-guards
```
