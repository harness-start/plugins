#!/usr/bin/env node

import { finalRenderPaths, AUDIO_EVIDENCE_SCHEMA, PROBE_SCHEMA, computeVideoSubjectDigest, validateVideoModel } from "../../lib/contract.js";
import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { mediaToolVersion, probeMedia, validateMeasuredMedia } from "../../lib/media.js";
import { loadVideoProject } from "../../lib/project.js";
import { assertVideoProjectRoot, atomicWriteJson, sessionMetadata, withWriterJournal } from "../../lib/writer.js";

import type { VideoModel } from "../../lib/contract.js";

function prerequisiteFindings(model: VideoModel) {
  const allowed = new Set(["ACCESSIBILITY_EVIDENCE_INVALID", "AUDIO_EVIDENCE_INVALID", "FRAME_EVIDENCE_INVALID", "PROBE_EVIDENCE_INVALID", "VIDEO_REVIEW_INVALID", "RELEASE_MANIFEST_INVALID", "RECEIPT_INVALID", "RELEASE_PATH_MISSING", "MUTATION_JOURNAL_OPEN"]);
  return validateVideoModel(model, { stage: "release" }).filter(({ code }) => !allowed.has(code));
}

async function main() {
  const root = assertVideoProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "video-probe", argv: processWriterArgv() });
  let model = await loadVideoProject(root);
  const findings = prerequisiteFindings(model);
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const { mediaPath } = finalRenderPaths(model);
  const project = model.project ?? {};
  const media = await probeMedia(`${root}/${mediaPath}`, { fps: project.fps, cwd: root });
  validateMeasuredMedia(media, {
    kind: "final",
    project: { fps: project.fps ?? Number.NaN, width: project.width ?? Number.NaN, height: project.height ?? Number.NaN },
    expectedFrames: project.durationInFrames ?? Number.NaN,
  });
  const tool = { name: "ffprobe", version: await mediaToolVersion() };
  const base = { plugin: "video-project-delivery-guard", artifactId: model.artifactId, subjectDigest: computeVideoSubjectDigest(model), output: { path: mediaPath, sha256: model.digests?.[mediaPath] }, tool, ...sessionMetadata("video-probe", grant) };
  await withWriterJournal(root, "video-probe", async () => {
    await atomicWriteJson(root, "evidence.probe.json", { schema: PROBE_SCHEMA, ...base, video: media });
    await atomicWriteJson(root, "evidence.audio.json", { schema: AUDIO_EVIDENCE_SCHEMA, ...base, audio: { present: media.hasAudio, codec: media.audioCodec, sampleRate: media.sampleRate, channels: media.channels, durationInFrames: media.durationInFrames } });
  }, grant);
  model = await loadVideoProject(root);
  process.stdout.write(`${JSON.stringify({ probe: model.digests?.["evidence.probe.json"], audio: model.digests?.["evidence.audio.json"] })}\n`);
}

main().catch((error: unknown) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[video-project-probe] ${message}\n`);
  process.exitCode = 2;
});
