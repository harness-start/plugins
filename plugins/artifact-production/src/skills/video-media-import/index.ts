import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "video-media-import",
  fullName: "Video media import",
  description: "Admit user-owned local images, audio, video, subtitles, or fonts through the plugin writer; never call vendor APIs or generate keyed media.",
  useCases: [
    "Admit user-owned local images, audio, video, subtitles, or fonts through the plugin writer; never call vendor APIs or generate keyed media.",
  ],
  constraints: [
    "Do not execute community generators, TTS, or cut/subtitle CLIs.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Video media import\n\nThis Skill is an **external-runner** only for files the user already placed on disk. It cannot write protected proof, evidence, review, or release paths. It cannot call vendor APIs or require an API key.\n\n## Procedure\n\n1. Keep source media outside `artifacts/video/<id>/`.\n2. Record each file in an external-run manifest with `assetId`, absolute `path`, and SHA-256.\n3. Admit with `node ${PLUGIN_ROOT}/dist/cli/harness.mjs video admit <root> <external-run-manifest>`.\n4. Mark this worker `used` only after the admit receipt binds the current bytes under `public/admitted/`.\n\nDo not execute community generators, TTS, or cut/subtitle CLIs.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
