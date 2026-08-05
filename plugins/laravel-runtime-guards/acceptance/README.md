# laravel-runtime-guards host acceptance

| Case | Behavior |
| --- | --- |
| 01-deny-storage-logs | PreToolUse deny writing `storage/logs/*` |

```bash
./scripts/acceptance/run.sh --plugin laravel-runtime-guards
```
