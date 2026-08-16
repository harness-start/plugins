---
name: music-project-authoring
description: Orchestrate a code-managed instrumental music project from brief and pinned external advice through deterministic composition, arrangement, Tone.js rendering, preview, independent review handoff, and digest-bound release.
---

# Music Project Authoring

Build music as reviewable source code and establish a causal chain from brief to audible WAV. This skill produces the work; it never authors or stamps `review.music.json`. Use `$music-project-review` in a different session for that gate.

## Establish the contract

1. Freeze `plan.brief.json`, `plan.direction.json`, and `plan.arrangement.json` before optimization.
2. State falsifiable assumptions for anything the user did not specify.
3. Keep v1 within instrumental synthesis: no samples, vocals, MIDI import/export, MP3, tempo maps, meter changes, or microtonality.
4. Read [mathematical-model.md](references/mathematical-model.md) before changing composition or optimization logic.
5. Read [project-contract.md](references/project-contract.md) before creating files, invoking advisers, rendering, or releasing.

## Compose external expertise

Use `plan.skill-composition.json` to select the pinned bilingual adviser pool. Keep at most three active in any phase and give every used adviser a distinct evidence artifact.

- `music-composition`: composition, harmony, form, and orchestration.
- `miaoxiang-music`: Chinese genre, ambience, guofeng, and scene vocabulary.
- `workflow-audio-production`: arrangement, balance, dynamics, and space.
- `workflow-analysis-quality`: reserved for preview/review QC.

External skills are reference-only advisers. Do not run their scripts, network calls, generators, or publishing steps. They cannot write the project. Put each structured result outside the project and admit recommendations through:

```bash
node "${PLUGIN_ROOT}/dist/cli/project-advice.mjs" "artifacts/music/<id>" "/absolute/path/to/advice.json"
```

The payload must bind the current subject digest and declare recommendations plus adopted and rejected items. Update sources only after the advice receipt exists.

```json
{
  "schema": "music-project-delivery-guard/advice-input/v1",
  "artifactId": "<id>",
  "subjectDigest": "<64-hex>",
  "skillName": "music-composition",
  "revision": "<pinned-40-hex>",
  "ecosystem": "en",
  "mode": "adviser",
  "phase": "composition",
  "summary": "<substantive summary>",
  "recommendations": [],
  "adopted": [],
  "rejected": []
}
```

## Initialize

Create the project under `artifacts/music/<id>`:

```bash
node "${PLUGIN_ROOT}/dist/cli/project-init.mjs" "artifacts/music/<id>" --install-browser
```

The command pins `tone@15.1.22`, `tonal@6.4.3`, `playwright@1.62.1`, `esbuild@0.28.2`, and `eslint@9.39.2`. Treat the generated `package-lock.json` as part of the source digest.

Edit only source-owned files directly:

- `src/composition.mjs` owns symbolic structure, motifs, harmony, energy, and track assignments.
- `src/instruments/*.mjs` owns synth and effect construction, but not transport, destination, network, time, randomness, or offline rendering.
- `music.project.json` owns track registration, audio format, and numerical quality limits.
- `plan.brief.json`, `plan.direction.json`, and `plan.arrangement.json` own creative intent.
- `plan.skill-composition.json` owns adviser selection and truthful use/skip reasons.
- `plan.contract.json` is protected and may advance only through `project-stage.mjs`.

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
node "${PLUGIN_ROOT}/dist/cli/project-lint.mjs" "artifacts/music/<id>"
```

Generate the current symbolic score and metrics:

```bash
node "${PLUGIN_ROOT}/dist/cli/project-optimize.mjs" "artifacts/music/<id>"
```

Inspect both `build/score.<sourceDigest>.json` and `build/metrics.<sourceDigest>.json`. Confirm hard violations are empty. Compare candidate metrics, but listen before deciding whether the selected variant serves the brief.

## Render and preview

Render each track and the mix through browser-side `Tone.Offline`:

```bash
node "${PLUGIN_ROOT}/dist/cli/project-render.mjs" "artifacts/music/<id>"
```

The renderer bundles only local instruments, blocks browser network requests, renders at 48 kHz stereo, and writes:

- `proofs/tNNN-<role>-<track>.<sourceDigest>.wav`
- `build/mix.<sourceDigest>.wav`
- `build/render.<sourceDigest>.json`, binding score, metrics, mix, and proof bytes

Create digest-bound preview evidence without rendering again, then optionally open the listener:

```bash
node "${PLUGIN_ROOT}/dist/cli/project-preview.mjs" "artifacts/music/<id>"
```

`project-preview.mjs` records per-mix and per-stem analysis and explicitly states that availability is not proof of listening. Hand `plan.*`, score, render receipt, preview evidence, mix, and every stem to a separate `$music-project-review` session. If it returns `changes_requested`, revise source and repeat optimize → render → preview; any source change invalidates prior evidence and review.

## Release

After an independent current `approved` review, advance the protected stage and release:

```bash
node "${PLUGIN_ROOT}/dist/cli/project-stage.mjs" "artifacts/music/<id>" release
node "${PLUGIN_ROOT}/dist/cli/project-release.mjs" "artifacts/music/<id>"
```

Release succeeds only if current source artifacts exist, the listening review binds the current mix, and objective WAV thresholds pass. It writes the final WAV, audio evidence, manifest, and receipt. Do not edit those protected files directly.

## Report evidence

Report:

- composition and profile decisions;
- hard constraints and candidate count;
- source digest and selected candidate ID;
- WAV duration, peak, RMS, DC offset, clipping, and non-silent ratio;
- independent review decision, findings, and any remaining artistic uncertainty;
- final output and receipt paths.

Distinguish facts, inferences, and assumptions. Say explicitly that mathematical optimization improves consistency against declared objectives; it does not prove universal musical quality.
