# Host acceptance

Docker-only acceptance runs real Claude Code and Codex sessions:

- `01-recover-structural-drift`: an empty root reaches a canonical instruction layout only after the first completion attempt is blocked.
- `02-reverify-after-late-change`: an initially verified layout becomes dirty after a later project edit and must be verified again.

```bash
./scripts/acceptance/run.sh --plugin project-instruction-guard
```
