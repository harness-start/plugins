# typescript-runtime-guards host acceptance

| Case | Behavior |
| --- | --- |
| 01-deny-lockfile | PreToolUse deny writing `package-lock.json` |

```bash
./scripts/acceptance/run.sh --plugin typescript-runtime-guards
```
