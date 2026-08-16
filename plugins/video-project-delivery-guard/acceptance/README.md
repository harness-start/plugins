# Video guard acceptance

The suite starts real Claude Code and Codex sessions in the Docker host-acceptance environment. It verifies observable Hook signals and post-session disk state for:

- ordinary non-video bypass;
- direct protected MP4 Write denial;
- incomplete release Stop denial;
- `dd` shell mutation denial;
- `node -e` writer-path substring spoof denial;
- missing `plan.contract.json` fail-closed Stop behavior.
- direct `public/admitted/` write denial; only the admission writer may cross that boundary.

Run both hosts:

```bash
./scripts/acceptance/run.sh --plugin video-project-delivery-guard
```

The writer render/probe/review/release pipeline is covered by offline subprocess integration tests with hermetic fake media tools. Live acceptance focuses on the real host dispatch/denial seams that cannot be established by stdin-only unit tests.

A host can exit with `1` after a denied tool response or remain blocked until the case timeout (`124`). Those exits count only when the case also finds the exact Hook signal and verifies that the protected output was not written; an inert or missing-Hook session still fails. Codex Stop details come from its structured Hook prompt.
