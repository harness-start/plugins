# Host acceptance

Docker-only acceptance runs real Claude Code and Codex sessions:

- `01-recover-bare-test-claim`: a mutation plus bare test claim is blocked, then recovered with a current command receipt and valid manifest.
- `02-recover-artifact-digest`: an intentionally wrong artifact digest is blocked, then corrected against the current output file.

```bash
./scripts/acceptance/run.sh --plugin verification-provenance-guard
```
