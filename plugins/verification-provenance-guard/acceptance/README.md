# Host acceptance

Docker-only acceptance runs real Claude Code and Codex sessions:

- `01-recover-bare-test-claim`: a mutation plus bare test claim is blocked, then recovered with a current command receipt and valid manifest.
- `02-recover-artifact-digest`: an intentionally wrong artifact digest is blocked, then corrected against the current output file.
- `03-block-green-only-code`: green-only code work is blocked and can only report an honest blocked state.
- `04-accept-refactor-baseline`: the same test command passes before and after a refactor.
- `05-recover-stale-green`: a post-GREEN mutation invalidates completion evidence until the test reruns.
- `06-non-code-negative-check`: a report follows negative check, mutation, validator success, and artifact verification.
- `07-ordinary-answer-bypass`: a read-only explanation remains outside the evidence protocol.

```bash
./scripts/acceptance/run.sh --plugin verification-provenance-guard
```
