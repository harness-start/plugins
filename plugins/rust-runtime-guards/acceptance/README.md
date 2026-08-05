# rust-runtime-guards host acceptance

| Case | Behavior |
| --- | --- |
| 01-deny-lockfile | PreToolUse deny writing `Cargo.lock` |

```bash
./scripts/acceptance/run.sh --plugin rust-runtime-guards
```
