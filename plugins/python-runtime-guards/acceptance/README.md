# python-runtime-guards host acceptance

| Case | Behavior |
| --- | --- |
| 01-deny-lockfile | PreToolUse deny writing `poetry.lock` |

```bash
./scripts/acceptance/run.sh --plugin python-runtime-guards
```
