---
name: music-project-authoring
description: Orchestrate a code-managed instrumental music project through reference analysis, composition, Tone.js rendering, review handoff, and release.
---

# Music Project Authoring

Build music as reviewable source code and establish a causal chain from brief to audible WAV. This skill produces the work; it never authors or stamps `review.music.json`. Use `$music-project-review` in a different session for that gate.

## Establish the contract

1. Freeze `plan.brief.json`, any required reference profile, `plan.direction.json`, and `plan.arrangement.json` before optimization.
2. State falsifiable assumptions for anything the user did not specify.
3. Keep v1 within instrumental synthesis: no samples, vocals, MIDI import/export, MP3, tempo maps, meter changes, or microtonality.
4. Read [mathematical-model.md](references/mathematical-model.md) before changing composition or optimization logic.
5. Read [project-contract.md](references/project-contract.md) before creating files, invoking advisers, rendering, or releasing.

## Compose bundled expertise

Use `plan.skill-composition.json` to select the current-source bilingual adviser pool. Keep at most three active in any phase and give every used adviser a distinct evidence artifact.

- [`music-composition-method`](../music-composition-method/SKILL.md): composition, harmony, form, and orchestration.
- [`music-genre-reference`](../music-genre-reference/SKILL.md): Chinese genre, ambience, guofeng, and scene vocabulary.
- [`music-reference-profile`](../music-reference-profile/SKILL.md): reference identity expressed as techniques rather than artist imitation.
- [`music-mix-qc`](../music-mix-qc/SKILL.md): arrangement, balance, dynamics, and space.

When a worker is selected, read the exact bundled instructions linked above. These companion Skills are reference-only advisers. Do not run scripts, network calls, generators, or publishing steps from any similarly named runtime capability. The advisers cannot write the project. Put each structured result outside the project and admit recommendations through:

```bash
node "${PLUGIN_ROOT}/dist/cli/project-advice.mjs" "artifacts/music/<id>" "/absolute/path/to/advice.json"
```

The payload must bind the current subject digest and declare recommendations plus adopted and rejected items. Update sources only after the advice receipt exists.

```json
{
  "schema": "music-production/advice-input/v1",
  "artifactId": "<id>",
  "subjectDigest": "<64-hex>",
  "skillName": "music-composition-method",
  "ecosystem": "en",
  "mode": "adviser",
  "phase": "composition",
  "summary": "<substantive summary>",
  "recommendations": [],
  "adopted": [],
  "rejected": []
}
```

## Analyze references before direction

Use `reference.mode: "none"` when no reference intent exists and `"traits"` when the user already supplied name-free technical traits. If the request names artists or tracks, use `"source-analysis"`; `music-reference-profile` then becomes mandatory before editing direction, arrangement, composition, or instruments.

Prepare a 3–5 item source manifest outside the project. Each item needs a stable kebab-case id, artist, title, and an honest `observationBasis`: `auditioned`, `documented-analysis`, or `user-described`. Put the SHA-256 of the exact manifest bytes in `plan.brief.json.reference.sourceSetSha256`. Do not claim audition when only metadata or written analysis was available.

```json
{
  "schema": "music-production/reference-sources-input/v1",
  "artifactId": "<id>",
  "references": [
    {
      "id": "reference-1",
      "artist": "<external-only artist>",
      "title": "<external-only track>",
      "observationBasis": "auditioned"
    },
    {
      "id": "reference-2",
      "artist": "<external-only artist>",
      "title": "<external-only track>",
      "observationBasis": "auditioned"
    },
    {
      "id": "reference-3",
      "artist": "<external-only artist>",
      "title": "<external-only track>",
      "observationBasis": "documented-analysis"
    }
  ]
}
```

After adding the source digest to the brief, calculate the SHA-256 of the exact `plan.brief.json` bytes. Mark the `music-reference-profile` worker `used` and set its `evidencePath` to `evidence/reference-profile.<briefSha256>.json` before invoking the writer.

Run the bundled `music-reference-profile` skill and prepare a separate profile input. Cover rhythmic foundation, harmonic architecture, instrumental techniques, production aesthetics, genre fusion, and energy architecture. Every trait must state whether it was observed, inferred, or user-described and cite one or more manifest ids. Distill 5–10 name-free descriptors, map the result to rhythm/tempo, harmony/voicing, timbre/effects, space/dynamics, and form/energy, and reject traits that v1 synthesis cannot implement. Set all three anti-imitation assertions only after removing artist names, signature material, and imitation prompts.

```json
{
  "schema": "music-production/reference-profile-input/v1",
  "artifactId": "<id>",
  "briefSha256": "<64-hex>",
  "sourceSetSha256": "<64-hex>",
  "skillName": "music-reference-profile",
  "ecosystem": "en",
  "mode": "reference-only",
  "phase": "reference-analysis",
  "dimensions": {
    "rhythmicFoundation": [{ "trait": "<trait>", "basis": "observed", "referenceIds": ["reference-1"] }],
    "harmonicArchitecture": [{ "trait": "<trait>", "basis": "observed", "referenceIds": ["reference-1"] }],
    "instrumentalTechniques": [{ "trait": "<trait>", "basis": "observed", "referenceIds": ["reference-1"] }],
    "productionAesthetics": [{ "trait": "<trait>", "basis": "observed", "referenceIds": ["reference-1"] }],
    "genreFusion": [{ "trait": "<trait>", "basis": "inferred", "referenceIds": ["reference-1"] }],
    "energyArchitecture": [{ "trait": "<trait>", "basis": "observed", "referenceIds": ["reference-1"] }]
  },
  "descriptors": ["<descriptor-1>", "<descriptor-2>", "<descriptor-3>", "<descriptor-4>", "<descriptor-5>"],
  "toneJsMapping": {
    "rhythmAndTempo": ["<mapping>"],
    "harmonyAndVoicing": ["<mapping>"],
    "timbreAndEffects": ["<mapping>"],
    "spaceAndDynamics": ["<mapping>"],
    "formAndEnergy": ["<mapping>"]
  },
  "unsupportedTraits": [{ "trait": "<trait>", "reason": "<reason>" }],
  "antiImitation": {
    "artistNamesRemoved": true,
    "signatureMaterialExcluded": true,
    "imitationPromptExcluded": true
  }
}
```

Admit the result through the only reference-profile writer:

```bash
node "${PLUGIN_ROOT}/dist/cli/project-reference.mjs" \
  "artifacts/music/<id>" \
  "/absolute/path/to/reference-sources.json" \
  "/absolute/path/to/reference-profile.json"
```

The writer stores only `evidence/reference-profile.<briefSha256>.json`; it rejects source identities in admitted content. If `music-reference-profile` is missing, the plugin package is corrupt; stop. Do not fabricate a compatible payload. Do not replace it with current-session knowledge or fabricate a compatible payload. Changing the brief or source manifest repeats reference-analysis; changing direction keeps the brief-bound profile current but invalidates downstream subject-bound evidence.

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
- `plan.skill-composition.json` owns adviser selection, artifact kinds, evidence paths, and truthful use/skip reasons.
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
- reference-profile digest and adopted/unsupported traits when source analysis was used;
- independent review decision, findings, and any remaining artistic uncertainty;
- final output and receipt paths.

Distinguish facts, inferences, and assumptions. Say explicitly that mathematical optimization improves consistency against declared objectives; it does not prove universal musical quality.
