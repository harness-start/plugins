---
name: tonejs-music-production
description: Create, edit, optimize, render, review, or release code-managed instrumental music with Tone.js. Use when a request involves algorithmic composition, symbolic notes or rhythm, Tone.js instruments, deterministic musical variation, offline WAV rendering, stems, audio metrics, or digest-bound music evidence.
---

# Tone.js Music Production

Build music as reviewable source code, then establish a complete causal chain from symbolic intent to audible WAV output. Use mathematics to make timing exact, search bounded, and trade-offs explicit. Never present a metric as proof that a piece is artistically good.

## Establish the contract

1. Record the brief: intended use, duration, mood, profile, structure, tempo, meter, key/mode, density, and instrumentation.
2. State falsifiable assumptions for anything the user did not specify.
3. Keep v1 within instrumental synthesis: no samples, vocals, MIDI import/export, MP3, tempo maps, meter changes, or microtonality.
4. Read [mathematical-model.md](references/mathematical-model.md) before changing composition or optimization logic.
5. Read [project-contract.md](references/project-contract.md) before creating files, rendering, or releasing.

## Initialize

Create the project under `artifacts/music/<id>`:

```bash
node "${PLUGIN_ROOT}/scripts/tools/project-init.mjs" <id> --workspace "${PWD}" --install-browser
```

The command pins `tone@15.1.22`, `tonal@6.4.3`, `playwright@1.62.1`, `esbuild@0.28.2`, and `eslint@9.39.2`. Treat the generated `package-lock.json` as part of the source digest.

Edit only source-owned files directly:

- `src/composition.mjs` owns symbolic structure, motifs, harmony, energy, and track assignments.
- `src/instruments/*.mjs` owns synth and effect construction, but not transport, destination, network, time, randomness, or offline rendering.
- `music.project.json` owns track registration, audio format, and numerical quality limits.
- `plan.contract.json` owns the requested stage: `source` or `release`.

## Compose mathematically

Represent time as integer ticks at PPQ 960. Represent pitches as MIDI integers derived from scale degrees. Keep randomness seeded and deterministic.

Use these layers in order:

1. Hard constraints reject invalid time ranges, pitches, silence, owner violations, and malformed topology.
2. Deterministic transformations generate a bounded set of motif rotations and reversals.
3. Profile weights score harmonic coherence, voice leading, rhythmic fit, motif coherence, structural arc, register separation, and controlled novelty.
4. Stable digest ordering resolves ties.

Use Euclidean rhythm only when distributed pulses suit the musical role. Do not add mathematical complexity without an audible or structural purpose.

## Validate and optimize

Run structural and ownership validation:

```bash
node "${PLUGIN_ROOT}/scripts/tools/project-lint.mjs" "artifacts/music/<id>"
```

Generate the current symbolic score and metrics:

```bash
node "${PLUGIN_ROOT}/scripts/tools/project-optimize.mjs" "artifacts/music/<id>"
```

Inspect both `build/score.<sourceDigest>.json` and `build/metrics.<sourceDigest>.json`. Confirm hard violations are empty. Compare candidate metrics, but listen before deciding whether the selected variant serves the brief.

## Render and review

Render each track and the mix through browser-side `Tone.Offline`:

```bash
node "${PLUGIN_ROOT}/scripts/tools/project-render.mjs" "artifacts/music/<id>"
```

The renderer bundles only local instruments, blocks browser network requests, renders at 48 kHz stereo, and writes:

- `proofs/tNNN-<role>-<track>.<sourceDigest>.wav`
- `build/mix.<sourceDigest>.wav`
- `build/render.<sourceDigest>.json`, binding score, metrics, mix, and proof bytes

For interactive listening:

```bash
node "${PLUGIN_ROOT}/scripts/tools/project-preview.mjs" "artifacts/music/<id>"
```

Listen to the complete mix and relevant proofs. Create `review/music-review.md` with these exact current bindings:

```text
sourceDigest: <64-hex source digest>
mixSha256: <64-hex mix hash>
method: listened
findings: <specific audible findings and disposition>
```

Revise source, re-optimize, re-render, and re-listen when the result does not meet the brief. Any source change invalidates prior generated artifacts and review.

## Release

Set `plan.contract.json` to `{"schema":"tonejs-music-plan/v1","targetStage":"release"}` only after review. Then run:

```bash
node "${PLUGIN_ROOT}/scripts/tools/project-release.mjs" "artifacts/music/<id>"
```

Release succeeds only if current source artifacts exist, the listening review binds the current mix, and objective WAV thresholds pass. It writes the final WAV, audio evidence, manifest, and receipt. Do not edit those protected files directly.

## Report evidence

Report:

- composition and profile decisions;
- hard constraints and candidate count;
- source digest and selected candidate ID;
- WAV duration, peak, RMS, DC offset, clipping, and non-silent ratio;
- listening findings and any remaining artistic uncertainty;
- final output and receipt paths.

Distinguish facts, inferences, and assumptions. Say explicitly that mathematical optimization improves consistency against declared objectives; it does not prove universal musical quality.
