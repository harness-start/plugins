#!/usr/bin/env node
// harness-source-hash: sha256:e43e79a4b1e44439529b9ae9133002565cac23a9b902524ba2c130520c2c6331
import {
  compareVideoSimilarity,
  extractFrameDigest,
  measureAudioLoudness,
  measureFrameLuma,
  mediaToolVersion,
  probeMedia,
  renderContactSheet,
  validateMeasuredMedia
} from "../chunks/chunk-ODCS262F.mjs";
import {
  AUDIO_EVIDENCE_SCHEMA,
  BLACK_FRAME_THRESHOLD,
  CAPTION_EVIDENCE_SCHEMA,
  MOTION_EVIDENCE_SCHEMA,
  PROBE_SCHEMA,
  REFERENCE_EVIDENCE_SCHEMA,
  SHOT_EVIDENCE_SCHEMA,
  computeVideoSubjectDigest,
  consumeWriterCapability,
  finalRenderPaths,
  processWriterArgv,
  validateVideoModel
} from "../chunks/chunk-WLIWUDS2.mjs";
import "../chunks/chunk-BUPZJ3VI.mjs";
import {
  assertVideoProjectRoot,
  atomicWriteJson,
  hashFile,
  loadVideoProject,
  sessionMetadata,
  withWriterJournal
} from "../chunks/chunk-XK7SS2NG.mjs";

// plugins/artifact-production/modules/video/src/entries/cli/project-probe.ts
import { mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
function prerequisiteFindings(model) {
  return validateVideoModel(model, { stage: "render" }).filter(({ code }) => code !== "MUTATION_JOURNAL_OPEN");
}
var isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function parseProjectJson(model, path) {
  try {
    return JSON.parse(model.files?.[path] ?? "null");
  } catch {
    return null;
  }
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
    expectedFrames: project.durationInFrames ?? Number.NaN
  });
  const loudness = await measureAudioLoudness(`${root}/${mediaPath}`, { cwd: root });
  const design = parseProjectJson(model, "design.system.json");
  const audioTarget = isRecord(design) && isRecord(design.audio) ? design.audio : {};
  const targetLufs = Number(audioTarget.integratedLufs);
  const targetPeak = Number(audioTarget.truePeakDb);
  if (!Number.isFinite(targetLufs) || !Number.isFinite(targetPeak) || Math.abs(loudness.integratedLufs - targetLufs) > 2 || loudness.truePeakDb > targetPeak + 0.1) throw new Error("AUDIO_TARGET_MISSED");
  const storyboard = parseProjectJson(model, "plan.storyboard.json");
  const beats = isRecord(storyboard) && Array.isArray(storyboard.beats) ? storyboard.beats.filter(isRecord) : [];
  const shotPlan = parseProjectJson(model, "plan.shots.json");
  const shotSelections = isRecord(shotPlan) && Array.isArray(shotPlan.selections) ? shotPlan.selections.filter(isRecord) : [];
  const shotReviewFrames = shotSelections.flatMap((selection) => Array.isArray(selection.reviewFrames) ? selection.reviewFrames : []);
  const sampleFrames = [.../* @__PURE__ */ new Set([...beats.flatMap((beat) => {
    const start = Number(beat.startFrame);
    const end = Number(beat.endFrame);
    return [start, Math.floor((start + end - 1) / 2), end - 1];
  }), ...shotReviewFrames])].filter((frame) => Number.isInteger(frame) && Number(frame) >= 0 && Number(frame) < Number(project.durationInFrames)).sort((left, right) => left - right);
  const samples = [];
  for (const frame of sampleFrames) {
    const digest = await extractFrameDigest(`${root}/${mediaPath}`, frame, Number(project.fps), { cwd: root });
    const luma = await measureFrameLuma(`${root}/${mediaPath}`, frame, Number(project.fps), { cwd: root });
    samples.push({ ...digest, luma, blackCandidate: luma.yAvg <= BLACK_FRAME_THRESHOLD.yAvgMax && luma.yMax <= BLACK_FRAME_THRESHOLD.yMaxMax });
  }
  const sampleMap = new Map(samples.map((sample) => [sample.frame, sample]));
  const motionBeats = beats.map((beat) => {
    const start = Number(beat.startFrame);
    const end = Number(beat.endFrame);
    const frames = [.../* @__PURE__ */ new Set([start, Math.floor((start + end - 1) / 2), end - 1])];
    const beatSamples = frames.map((frame) => sampleMap.get(frame)).filter((sample) => sample !== void 0);
    const changed = new Set(beatSamples.map((sample) => sample.sha256)).size > 1;
    return { id: String(beat.id), startFrame: start, endFrame: end, changed, allowedStatic: beat.allowStatic === true, samples: beatSamples };
  });
  const changedRatio = motionBeats.length === 0 ? 0 : motionBeats.filter((beat) => beat.changed || beat.allowedStatic).length / motionBeats.length;
  const plan = isRecord(model.plan) ? model.plan : {};
  const motionVerdict = plan.profile !== "motion-explainer" || changedRatio >= 0.8 ? "pass" : "fail";
  if (motionVerdict !== "pass") throw new Error("MOTION_EVIDENCE_FAILED");
  const captionManifest = parseProjectJson(model, "src/captions/manifest.json");
  const captionUnits = isRecord(captionManifest) && Array.isArray(captionManifest.units) ? captionManifest.units.filter(isRecord) : [];
  const captionItems = captionUnits.map((unit) => {
    const source = `src/captions/${String(unit.source)}`;
    const binding = parseProjectJson(model, source);
    const record = isRecord(binding) ? binding : {};
    const durationSeconds = (Number(unit.endFrame) - Number(unit.startFrame)) / Number(project.fps);
    return { id: String(unit.id), startFrame: Number(unit.startFrame), endFrame: Number(unit.endFrame), charsPerSecond: durationSeconds > 0 ? String(record.text ?? "").length / durationSeconds : Number.POSITIVE_INFINITY };
  });
  const captionOverlap = captionItems.some((item, index) => index > 0 && item.startFrame < Number(captionItems[index - 1]?.endFrame));
  if (captionOverlap || captionItems.some((item) => !Number.isFinite(item.charsPerSecond))) throw new Error("CAPTION_EVIDENCE_FAILED");
  const references = parseProjectJson(model, "plan.references.json");
  const referenceList = isRecord(references) && Array.isArray(references.references) ? references.references.filter(isRecord) : [];
  const assetManifest = parseProjectJson(model, "plan.assets.json");
  const assets = isRecord(assetManifest) && Array.isArray(assetManifest.assets) ? assetManifest.assets.filter(isRecord) : [];
  const comparisons = [];
  for (const reference of referenceList) {
    if (reference.fidelity !== "frame-aligned") {
      comparisons.push({ id: String(reference.id), fidelity: reference.fidelity, verdict: "review" });
      continue;
    }
    const asset = assets.find((entry) => entry.id === reference.assetId);
    if (!isRecord(asset) || typeof asset.path !== "string") throw new Error("REFERENCE_ASSET_MISSING");
    const referenceMedia = await probeMedia(join(root, asset.path), { fps: project.fps, cwd: root });
    if (referenceMedia.durationInFrames !== media.durationInFrames || referenceMedia.fps !== media.fps || referenceMedia.width !== media.width || referenceMedia.height !== media.height) throw new Error("REFERENCE_TIMEBASE_MISMATCH");
    const similarity = await compareVideoSimilarity(join(root, asset.path), join(root, mediaPath), { cwd: root });
    const minimumSsim = typeof reference.minimumSsim === "number" ? reference.minimumSsim : 0.95;
    const minimumPsnr = typeof reference.minimumPsnr === "number" ? reference.minimumPsnr : 30;
    const verdict = similarity.ssim >= minimumSsim && (similarity.psnr === Number.POSITIVE_INFINITY || similarity.psnr >= minimumPsnr) ? "pass" : "fail";
    if (verdict !== "pass") throw new Error("REFERENCE_FIDELITY_FAILED");
    comparisons.push({ id: String(reference.id), fidelity: "frame-aligned", rights: reference.rights, minimumSsim, minimumPsnr, ssim: similarity.ssim, psnr: Number.isFinite(similarity.psnr) ? similarity.psnr : "infinity", verdict });
  }
  const tool = { name: "ffprobe", version: await mediaToolVersion() };
  const base = { plugin: "video-production", artifactId: model.artifactId, subjectDigest: computeVideoSubjectDigest(model), output: { path: mediaPath, sha256: model.digests?.[mediaPath] }, tool, ...sessionMetadata("video-probe", grant) };
  const shotEvidence = shotSelections.map((selection) => {
    const implementationPath = String(selection.implementationPath);
    const reviewFrames = Array.isArray(selection.reviewFrames) ? selection.reviewFrames.map((frame) => sampleMap.get(Number(frame))).filter((sample) => sample !== void 0) : [];
    return { beatId: selection.beatId, recipeId: selection.recipeId, styleId: selection.styleId, usage: selection.usage, implementationPath, implementationSha256: model.digests?.[implementationPath], reviewFrames };
  });
  const blackCandidates = samples.filter((sample) => sample.blackCandidate).map(({ frame, timestampSeconds, sha256, luma }) => ({ frame, timestampSeconds, sha256, luma }));
  await withWriterJournal(root, "video-probe", async () => {
    const temporary = join(root, ".tmp", "video-guard", `contact-sheet.${process.pid}.png`);
    const contactPath = join(root, "evidence", "contact-sheet.png");
    await mkdir(join(root, "evidence"), { recursive: true });
    await renderContactSheet(join(root, mediaPath), sampleFrames, temporary, { cwd: root });
    await rename(temporary, contactPath);
    const contact = await hashFile(contactPath, { maxBytes: 64 * 1024 * 1024 });
    await atomicWriteJson(root, "evidence.probe.json", { schema: PROBE_SCHEMA, ...base, video: media });
    await atomicWriteJson(root, "evidence.audio.json", { schema: AUDIO_EVIDENCE_SCHEMA, ...base, audio: { present: media.hasAudio, codec: media.audioCodec, sampleRate: media.sampleRate, channels: media.channels, durationInFrames: media.durationInFrames }, loudness, target: audioTarget });
    await atomicWriteJson(root, "evidence.motion.json", { schema: MOTION_EVIDENCE_SCHEMA, ...base, verdict: motionVerdict, changedRatio, beats: motionBeats, blackFrameThreshold: BLACK_FRAME_THRESHOLD, blackCandidates, contactSheetSha256: contact.digest });
    await atomicWriteJson(root, "evidence.captions.json", { schema: CAPTION_EVIDENCE_SCHEMA, ...base, verdict: "pass", count: captionItems.length, overlap: false, items: captionItems });
    await atomicWriteJson(root, "evidence.reference.json", { schema: REFERENCE_EVIDENCE_SCHEMA, ...base, verdict: "pass", comparisons });
    if (isRecord(shotPlan)) await atomicWriteJson(root, "evidence.shots.json", { schema: SHOT_EVIDENCE_SCHEMA, ...base, catalogRevision: shotPlan.catalogRevision, selections: shotEvidence });
    await unlink(temporary).catch(() => {
    });
  }, grant);
  model = await loadVideoProject(root);
  process.stdout.write(`${JSON.stringify({ probe: model.digests?.["evidence.probe.json"], audio: model.digests?.["evidence.audio.json"], motion: model.digests?.["evidence.motion.json"], captions: model.digests?.["evidence.captions.json"], reference: model.digests?.["evidence.reference.json"], shots: model.digests?.["evidence.shots.json"] })}
`);
}
main().catch((error) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[video-project-probe] ${message}
`);
  process.exitCode = 2;
});
