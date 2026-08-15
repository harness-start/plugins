#!/usr/bin/env node
import {
  mediaToolVersion,
  probeMedia,
  validateMeasuredMedia
} from "../chunks/chunk-VDPDJ7LH.mjs";
import {
  AUDIO_EVIDENCE_SCHEMA,
  PROBE_SCHEMA,
  computeVideoSubjectDigest,
  consumeWriterCapability,
  finalRenderPaths,
  processWriterArgv,
  validateVideoModel
} from "../chunks/chunk-6W43YK4G.mjs";
import {
  assertVideoProjectRoot,
  atomicWriteJson,
  loadVideoProject,
  sessionMetadata,
  withWriterJournal
} from "../chunks/chunk-MQPEWRNU.mjs";

// plugins/video-project-delivery-guard/src/entries/cli/project-probe.ts
function prerequisiteFindings(model) {
  const allowed = /* @__PURE__ */ new Set(["ACCESSIBILITY_EVIDENCE_INVALID", "AUDIO_EVIDENCE_INVALID", "FRAME_EVIDENCE_INVALID", "PROBE_EVIDENCE_INVALID", "VIDEO_REVIEW_INVALID", "RELEASE_MANIFEST_INVALID", "RECEIPT_INVALID", "RELEASE_PATH_MISSING", "MUTATION_JOURNAL_OPEN"]);
  return validateVideoModel(model, { stage: "release" }).filter(({ code }) => !allowed.has(code));
}
async function main() {
  const root = assertVideoProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "video-probe", argv: processWriterArgv() });
  let model = await loadVideoProject(root);
  const findings = prerequisiteFindings(model);
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const { mediaPath } = finalRenderPaths(model);
  const media = await probeMedia(`${root}/${mediaPath}`, { fps: model.project.fps, cwd: root });
  validateMeasuredMedia(media, { kind: "final", project: model.project, expectedFrames: model.project.durationInFrames });
  const tool = { name: "ffprobe", version: await mediaToolVersion() };
  const base = { plugin: "video-project-delivery-guard", artifactId: model.artifactId, subjectDigest: computeVideoSubjectDigest(model), output: { path: mediaPath, sha256: model.digests[mediaPath] }, tool, ...sessionMetadata("video-probe", grant) };
  await withWriterJournal(root, "video-probe", async () => {
    await atomicWriteJson(root, "evidence.probe.json", { schema: PROBE_SCHEMA, ...base, video: media });
    await atomicWriteJson(root, "evidence.audio.json", { schema: AUDIO_EVIDENCE_SCHEMA, ...base, audio: { present: media.hasAudio, codec: media.audioCodec, sampleRate: media.sampleRate, channels: media.channels, durationInFrames: media.durationInFrames } });
  }, grant);
  model = await loadVideoProject(root);
  process.stdout.write(`${JSON.stringify({ probe: model.digests["evidence.probe.json"], audio: model.digests["evidence.audio.json"] })}
`);
}
main().catch((error) => {
  process.stderr.write(`[video-project-probe] ${error.message}
`);
  process.exitCode = 2;
});
