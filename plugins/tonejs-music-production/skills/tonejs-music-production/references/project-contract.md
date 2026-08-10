# Project contract

## Source ownership

`src/composition.mjs` is trusted executable configuration. It must be deterministic and must not access network, wall-clock time, rendering, recording, or transport lifecycle. Instrument modules create and connect instruments to the supplied output. They must not call `toDestination()` or own transport/render lifecycle.

The plugin renderer alone owns esbuild, Playwright, Chromium, `Tone.Offline`, destination routing, track isolation, and WAV writes.

## Digest chain

The subject digest covers the plugin engine version and all audio-affecting source files except generated outputs, stage-only `plan.contract.json`, review, receipt, and the mutation journal. Generated filenames include this digest. An audio source or engine change therefore makes old score, metrics, proofs, mix, and review non-current without deleting evidence; changing only the requested closure stage does not change the music identity.

Protected outputs are `build/`, `proofs/`, `dist/`, `evidence.audio.json`, `release.manifest.json`, and `receipt.release.json`. Only registered plugin tools may write them.

## Audio acceptance

v1 release format is PCM16 WAV, 48 kHz, stereo. The project supplies thresholds for maximum peak dBFS, minimum RMS dBFS, maximum absolute DC offset, and clipped sample count. Evidence also records duration and non-silent ratio.

Objective metrics catch silence, clipping, level, format, and DC failures. They do not replace listening. Release also requires a review binding the current source digest and exact mix SHA-256.

## Recovery

Writers create `.music-delivery-journal.json` before multi-file mutations and remove it only after validation succeeds. If it remains, inspect the operation and outputs; resume or roll back the specific interrupted write. Do not bypass the guard or delete the journal without reconciling partial files.
