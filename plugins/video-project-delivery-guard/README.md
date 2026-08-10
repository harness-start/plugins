# Video Project Delivery Guard

Guards Remotion projects under `artifacts/video/<video-id>/`. The release gate binds project inputs to measured MP4/WAV render proofs, final ffprobe evidence, extracted frame hashes, an accessibility checklist, an independently session-bound review, a release manifest, and a SHA-256 receipt.

The plugin requires Node.js, npm, `ffmpeg`, and `ffprobe`. Render dependencies stay inside the artifact project and must be pinned by `package-lock.json`.

## Project contract

`plan.contract.json` must bind the artifact and closure stage:

```json
{
  "artifactId": "demo",
  "targetStage": "release"
}
```

`video.project.json` supplies the measured media contract:

```json
{
  "artifactId": "demo",
  "compositionId": "Main",
  "durationInFrames": 240,
  "fps": 30,
  "width": 1920,
  "height": 1080
}
```

The artifact-owned `package.json` must pin `remotion`, `@remotion/cli`, `react`, and `react-dom`, and provide these trusted executable-config scripts:

```json
{
  "scripts": {
    "video:render:visual": "node tools/render-visual.mjs",
    "video:render:audio": "node tools/render-audio.mjs",
    "video:render:final": "remotion render src/index.ts Main"
  }
}
```

The render writer invokes each script through `npm run` and appends fixed `--output`, `--start-frame`, `--end-frame`, `--fps`, `--composition-id`, and, for unit proofs, `--source` arguments. A script must write only the requested temporary output; the writer probes it before atomically promoting it to a protected path.

## Writer flow

Run writers through a host shell tool while the plugin is active. `PreToolUse` accepts only a pure, exact writer invocation and issues a 30-second, argv-bound, single-use capability. Calling a writer directly outside that path fails with `WRITER_CAPABILITY_MISSING`.

For each registered unit, then the final composition:

```bash
node "${PLUGIN_ROOT}/scripts/tools/project-render.mjs" artifacts/video/demo visual v001-intro.f000000-f000090.tsx
node "${PLUGIN_ROOT}/scripts/tools/project-render.mjs" artifacts/video/demo audio a001-music-bed.f000000-f000240.audio.json
node "${PLUGIN_ROOT}/scripts/tools/project-render.mjs" artifacts/video/demo final
node "${PLUGIN_ROOT}/scripts/tools/project-probe.mjs" artifacts/video/demo
```

Claude Code can use `${CLAUDE_PLUGIN_ROOT}` in place of `${PLUGIN_ROOT}`. An absolute installed-plugin path is also accepted.

Review must run in a different real host session from rendering. Its input file must be outside the artifact root:

```json
{
  "schema": "video-project-delivery-guard/review-input/v1",
  "artifactId": "demo",
  "outputSha256": "<64 lowercase hex characters>",
  "verdict": "pass",
  "reviewer": {
    "kind": "independent-agent",
    "id": "reviewer-1",
    "sessionId": "<current reviewer host session id>"
  },
  "frames": [0, 120, 239],
  "checks": {
    "captionsReviewed": true,
    "flashingReviewed": true,
    "contrastReviewed": true
  },
  "notes": "Review summary"
}
```

Then run:

```bash
node "${PLUGIN_ROOT}/scripts/tools/project-review.mjs" artifacts/video/demo /absolute/path/review-input.json
node "${PLUGIN_ROOT}/scripts/tools/project-release.mjs" artifacts/video/demo
```

The reviewer session is taken from the one-time capability, not trusted solely from the input JSON. The release writer refuses missing, stale, self-reviewed, malformed, or byte-mismatched evidence.

## Verification

```bash
node --test plugins/video-project-delivery-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin video-project-delivery-guard
```

The validator proves file and frame projections, actual media container/stream/dimension/duration facts, writer provenance inside the Hook trust boundary, evidence structure, and snapshot freshness. It does not automatically prove aesthetics, semantic subtitle accuracy, narrative quality, or content truthfulness; those remain reviewer conclusions recorded in the structured review.

See [DESIGN.md](DESIGN.md) for ownership, trust, resource, and failure boundaries.
