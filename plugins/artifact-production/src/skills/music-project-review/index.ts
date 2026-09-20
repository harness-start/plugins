import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "music-project-review",
  fullName: "Music Project Review",
  description: "Independently audition a current music mix and stems, record digest-bound findings, and submit approval or changes requested.",
  useCases: [
    "Independently audition a current music mix and stems, record digest-bound findings, and submit approval or changes requested.",
  ],
  constraints: [
    "Do not execute its scripts or commands.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Music Project Review\n\nUse this skill in a session that did not create the current render. It is a reviewer, not a producer.\n\n## Authority boundary\n\n- Read `plan.brief.json`, `plan.direction.json`, `plan.arrangement.json`, the symbolic score, render receipt, preview evidence, current mix, every proof stem, and the current anonymous reference profile when source analysis was used.\n- You may consult the installed current-source `workflow-analysis-quality` reference. Do not execute its scripts or commands.\n- Do not edit plans, composition or instrument sources, generated audio, preview evidence, release manifests, or receipts.\n- Do not call `node ${PLUGIN_ROOT}/dist/cli/harness.mjs music release`. Return requested changes to `$music-project-authoring`.\n- Write the review payload outside the project root, then submit it only through `node ${PLUGIN_ROOT}/dist/cli/harness.mjs music review`.\n\n## Review gate\n\nAudition the exact digest-bound mix and every stem. Cover brief alignment, melodic and harmonic coherence, rhythm and groove, form and arrangement, timbre and orchestration, balance/space/dynamics, and technical integrity. For a source-analysis brief, also compare the audible result with the anonymous profile under `reference-profile-alignment`; do not recover artist identities or rerun `music-reference-profile`. Every finding needs a stable id, severity, exact evidence path and SHA-256, a verifiable fix, status, and recheck evidence for blocker or major findings that are marked verified.\n\nUse `changes_requested` while any blocker or major finding remains open. Use `approved` only when the current artifacts meet the brief and all required checks pass. The writer binds your decision to the current subject, mix, stems, preview, session, and payload digest.\n\nPrepare this payload outside the project root. `coverage` must follow the writer's expected order: score, metrics, render receipt, mix, stems in track order, then preview evidence. Supply all seven check ids named above in kebab case.\n\n```json\n{\n  \"schema\": \"music-production/review-input/v2\",\n  \"artifactId\": \"<id>\",\n  \"subjectDigest\": \"<64-hex>\",\n  \"mixSha256\": \"<64-hex>\",\n  \"decision\": \"approved\",\n  \"reviewer\": {\n    \"kind\": \"independent-agent\",\n    \"id\": \"<reviewer-id>\",\n    \"sessionId\": \"<current-independent-session>\"\n  },\n  \"coverage\": [{ \"path\": \"<artifact-path>\", \"sha256\": \"<64-hex>\" }],\n  \"checks\": [{ \"id\": \"brief-alignment\", \"status\": \"pass\", \"note\": \"<audible evidence>\" }],\n  \"findings\": []\n}\n```\n\nLegacy `brief/v1` projects continue to use `review-input/v1`. Current `brief/v2` projects use v2, and source-analysis coverage appends `evidence/reference-profile.<briefSha256>.json` after preview evidence.\n\nSubmit it with `node \"${PLUGIN_ROOT}/dist/cli/harness.mjs music review\" \"artifacts/music/<id>\" \"/absolute/path/to/review-input.json\"`.\n",
  }),
  codexInterface: {
    shortDescription: "Independently audition and review a digest-bound music render.",
    defaultPrompt: "Use $music-project-review in an independent session to audition the current mix and stems and submit a digest-bound review decision.",
  },
  sourceDir: new URL("./", import.meta.url),
});
