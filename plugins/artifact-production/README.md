# artifact-production

`artifact-production` creates reviewable visual, audiovisual, document, and learning artifacts through source-first pipelines. It covers logos, diagrams, posters, presentations, print publications, videos, instrumental music, and training packages for Claude Code and Codex.

## Purpose

Producing an artifact is more than writing a binary file. A credible delivery needs editable source, explicit direction, deterministic writers, measured probes, an independent review boundary, and a release receipt bound to the current inputs and outputs. This owner provides those end-to-end contracts while keeping read-only advisers separate from writers and release authority.

## Design

Eight production domains live under `src/domains/`: `logo`, `diagram`, `poster`, `presentation`, `print`, `video`, `music`, and `training`. Each domain owns its source contract, generated paths, writers, Hook protections, evidence, independent-review input, and release validation. The owner has one Hook dispatcher per host and one unified public CLI that routes `<resource> <action>` to the responsible domain in process.

Skills own art direction, planning, authoring orchestration, and visual or auditory judgment. Hooks own mechanical rules: protect generated outputs, admit only registered writers, bind evidence to current bytes, keep review independent, and block incomplete release claims. Installing the owner activates all formats; there are no capability profiles and no requirement for external Skills.

## Capabilities

| Module | Produces | Core workflow |
| --- | --- | --- |
| `logo` | Native vector masters, variants, construction/specimen sheets, previews, and exports | Brief → brand direction → construction → variants → preview → independent review → release |
| `diagram` | SVG, PNG, HTML, and draw.io-compatible diagram projects | Semantic source/import → design → render → probes → independent review → release |
| `poster` | Deterministic poster SVG/PNG variants | Brief/art direction → Satori source → render → scanability/composition evidence → independent review → release |
| `presentation` | Editable 16:9 PPTX, rendered pages, and PDF | Requirements → storyboard → design system → PptxGenJS source → render/probe → independent review → release |
| `print` | Static publication HTML/PDF packages | Ordered publication sections → lint → PDF evidence → independent review coverage → release |
| `video` | Evidence-bound Remotion video with admitted media | Direction/storyboard → media admission → shot staging → render → visual/audio probes → independent review → release |
| `music` | Code-managed instrumental project, mix, and stems | Reference analysis → composition/arrangement → Tone.js rendering → loudness/mix evidence → independent audition → release |
| `training` | Agenda, instructor/participant materials, exercises, assessments, and delivery package | Audience/outcomes → instructional design → material render → criterion-complete review → release |

Read-only adviser Skills cover brand direction, color/accessibility, logo form, diagram/poster/slide/video critique, academic and cultural poster direction, presentation storyboards, music composition/reference/mix QC, video motion/media/shot planning, and training review. Authoring and review Skills have explicit writer-authority boundaries.

## When to use it

Use it when the requested deliverable is one of the supported artifact families and must remain editable, reproducible, reviewable, and releasable. It is suitable for creating a new brand mark, architecture diagram, campaign poster, slide deck, static publication, short explainer or product video, instrumental track, or structured training program.

Use the read-only critique Skills when an existing artifact needs assessment without mutation. Use the independent review Skills only after another session has produced current rendered outputs and evidence.

## When not to use it

Do not use it for ordinary application UI; use `interface-design`. Do not use it merely to explain a visual concept, edit an unsupported proprietary file in place, or produce an unconstrained one-off binary with no source/evidence contract. The PPTX workflow creates a new deck and is not an arbitrary existing-template editor. The music workflow is not a general DAW controller, and the video workflow does not call vendor media-generation APIs or accept undeclared rights.

Do not let the producing session self-approve an artifact when the contract requires an independent review. A rendered file alone is not a release.

## Runtime behavior

At `SessionStart`, format domains report relevant existing projects without activating unrelated hard gates. `PreToolUse` protects generated outputs and restricts mutations to registered, capability-bound writers when a governed artifact project is in scope. Shell scope requires the command or current directory to identify the carrier path; merely having an existing or released artifact project does not turn unrelated repo-root interpreters into artifact mutations. `PostToolUse` and failure events update evidence or recovery information. `Stop` and `SubagentStop` validate the active project's declared stage and prevent a false completion claim when current evidence, review, or release receipts are missing.

The dispatcher evaluates only routes whose matcher applies. A domain is scoped by the artifact path and project contract, so installing this all-in owner does not cause every format validator to run against every repository write. Hook activation or a successfully formatted file is not proof of visual quality; rendered outputs and outcome-level review remain required.

## Public interfaces

The deterministic CLI protocol is:

```bash
node "${PLUGIN_ROOT}/dist/cli/harness.mjs" <resource> <action> [arguments]
```

Supported resources and actions:

| Resource | Actions |
| --- | --- |
| `logo` | `advice`, `lint`, `lock`, `preview`, `release`, `render`, `review`, `stage`, `validate` |
| `diagram` | `import`, `init`, `lint`, `probe`, `release`, `render`, `review` |
| `poster` | `init`, `lint`, `probe`, `release`, `render`, `review` |
| `presentation` | `init`, `lint`, `probe`, `release`, `render`, `review` |
| `print` | `lint`, `release` |
| `video` | `admit`, `catalog`, `init`, `lint`, `probe`, `release`, `render`, `review`, `shot-stage` |
| `music` | `advice`, `init`, `lint`, `optimize`, `preview`, `reference`, `release`, `render`, `review`, `stage` |
| `training` | `init`, `lint`, `release`, `render`, `review` |

Principal public authoring/review Skills are `logo-project-authoring`, `logo-project-review`, `diagram-project-authoring`, `diagram-project-review`, `poster-project-authoring`, `poster-project-review`, `pptx-deck-authoring`, `pptx-deck-review`, `video-project-authoring`, `video-project-review`, `music-project-authoring`, `music-project-review`, `training-program-design`, and `training-program-review`. Narrow adviser Skills are listed in `skills/` and describe their own read-only boundaries.

This owner exposes no MCP server.

## Configuration and state

Governed projects live under `artifacts/<format>/<artifact-id>/` and contain format-specific source contracts, delivery journals, rendered outputs, probes, review inputs, and release receipts. Writers use digests to bind evidence to current source and generated bytes. Some formats admit external assets or references through registered commands so provenance and rights declarations remain part of the project record.

The plugin stores only the state required by each production contract. It does not rely on development-workspace caches or globally installed Skills after publication. The owner's generated `dist/` runtime is committed and hash-bound to the complete owner and shared-core TypeScript sources.

## Boundaries

Deterministic writers and probes can establish file shape, byte identity, dimensions, timing, loudness, manifest consistency, and contract completeness. They cannot establish taste, factual correctness of creative content, legal clearance, audience effectiveness, or accessibility by themselves. Independent review provides human/model judgment but is still bounded by the submitted evidence and rendered samples.

The plugin does not guarantee that every external renderer, font, codec, browser, Office installation, or media tool is present. Missing optional tooling must be reported with a recovery path rather than fabricated output. Release receipts establish observable workflow integrity, not legal approval or a tamper-resistant signature against a malicious same-user process.

## Verification

```bash
node --import tsx --test \
  plugins/artifact-production/tests/*.test.ts \
  plugins/artifact-production/tests/domains/**/*.test.ts
npm run check:dist
```

Format-specific real-render tests may require FFmpeg, browser, font, or Office tooling. Live Claude Code and Codex acceptance must run through `./scripts/acceptance/run.sh --plugin artifact-production` in Docker.
