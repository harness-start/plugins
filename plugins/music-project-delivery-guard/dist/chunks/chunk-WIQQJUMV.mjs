// harness-source-hash: sha256:9252d0cc9916d9adbb98c685ea0599f968feb60c7151c614c458b266914093e7
import {
  MUSIC_ENGINE,
  computeMusicSubjectDigest,
  createMusicReceipt,
  musicSourcePaths,
  validateMusicModel,
  validateMusicReview
} from "./chunk-CA6YKXLK.mjs";

// plugins/music-project-delivery-guard/src/lib/wav.ts
var textEncoder = new TextEncoder();
function writeAscii(view, offset, value) {
  new Uint8Array(view.buffer, view.byteOffset + offset, value.length).set(textEncoder.encode(value));
}
function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
function encodePcm16Wav({ channels, sampleRate }) {
  if (!Array.isArray(channels) || channels.length === 0 || channels.length > 8) throw new Error("WAV_CHANNELS_INVALID");
  if (!Number.isInteger(sampleRate) || sampleRate < 8e3 || sampleRate > 192e3) throw new Error("WAV_SAMPLE_RATE_INVALID");
  const frames = channels[0]?.length;
  if (!Number.isInteger(frames) || frames === void 0 || channels.some((channel) => channel.length !== frames)) throw new Error("WAV_FRAME_COUNT_INVALID");
  const dataBytes = frames * channels.length * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, Number(channel[frame]) || 0));
      view.setInt16(offset, sample <= -1 ? -32768 : Math.round(sample * 32767), true);
      offset += 2;
    }
  }
  return bytes;
}
function analyzePcm16Wav(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 44 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") throw new Error("WAV_HEADER_INVALID");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format = null;
  let dataOffset = -1;
  let dataBytes = 0;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const content = offset + 8;
    if (content + size > bytes.byteLength) throw new Error("WAV_CHUNK_TRUNCATED");
    if (id === "fmt ") {
      format = {
        audioFormat: view.getUint16(content, true),
        channels: view.getUint16(content + 2, true),
        sampleRate: view.getUint32(content + 4, true),
        blockAlign: view.getUint16(content + 12, true),
        bitsPerSample: view.getUint16(content + 14, true)
      };
    } else if (id === "data") {
      dataOffset = content;
      dataBytes = size;
    }
    offset = content + size + size % 2;
  }
  if (!format || dataOffset < 0 || format.audioFormat !== 1 || format.bitsPerSample !== 16 || format.channels <= 0) throw new Error("WAV_PCM16_REQUIRED");
  const frames = dataBytes / format.blockAlign;
  if (!Number.isInteger(frames)) throw new Error("WAV_DATA_ALIGNMENT_INVALID");
  let peak = 0;
  let squareSum = 0;
  let sum = 0;
  let clippedSamples = 0;
  let silentSamples = 0;
  const sampleCount = dataBytes / 2;
  for (let index = 0; index < sampleCount; index += 1) {
    const integer = view.getInt16(dataOffset + index * 2, true);
    const sample = integer / 32768;
    const absolute = Math.abs(sample);
    peak = Math.max(peak, absolute);
    squareSum += sample * sample;
    sum += sample;
    if (Math.abs(integer) >= 32767) clippedSamples += 1;
    if (absolute < 1e-3) silentSamples += 1;
  }
  const rms = sampleCount > 0 ? Math.sqrt(squareSum / sampleCount) : 0;
  return {
    format: "pcm16",
    sampleRate: format.sampleRate,
    channels: format.channels,
    bitsPerSample: format.bitsPerSample,
    frames,
    durationSeconds: frames / format.sampleRate,
    peakDbfs: peak > 0 ? 20 * Math.log10(peak) : Number.NEGATIVE_INFINITY,
    rmsDbfs: rms > 0 ? 20 * Math.log10(rms) : Number.NEGATIVE_INFINITY,
    dcOffset: sampleCount > 0 ? sum / sampleCount : 0,
    clippedSamples,
    nonSilentRatio: sampleCount > 0 ? 1 - silentSamples / sampleCount : 0
  };
}

// plugins/music-project-delivery-guard/src/lib/release.ts
import { createHash } from "node:crypto";
import { copyFile, mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
var sha256 = (value) => createHash("sha256").update(value).digest("hex");
async function collect(root, directory, model, count) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await collect(root, absolute, model, count);
    else if (entry.isFile()) {
      count.value += 1;
      if (count.value > 4096) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      const bytes = await readFile(absolute);
      model.files[filePath] = bytes.toString("utf8");
      model.digests[filePath] = sha256(bytes);
    }
  }
}
function asProject(value) {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}
async function collectMusicModel(root) {
  const model = { artifactId: "", files: {}, digests: {}, project: null };
  await collect(root, root, model, { value: 0 });
  model.project = asProject(JSON.parse(model.files["music.project.json"] ?? "null"));
  model.artifactId = basename(root);
  return model;
}
async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}
`, { flag: "wx" });
  await rename(temporaryPath, filePath);
}
function assessQuality(analysis, quality) {
  const checks = {
    sampleRate: analysis.sampleRate === 48e3,
    channels: analysis.channels === 2,
    peak: analysis.peakDbfs <= quality.maxPeakDbfs,
    rms: analysis.rmsDbfs >= quality.minRmsDbfs,
    dcOffset: Math.abs(analysis.dcOffset) <= quality.maxAbsDcOffset,
    clippedSamples: analysis.clippedSamples <= quality.maxClippedSamples,
    nonSilent: analysis.nonSilentRatio > 0
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}
function validateListeningReview(review, { sourceDigest, mixSha256 }) {
  if (typeof review !== "object" || review === null || Array.isArray(review)) return false;
  const record = review;
  return record.schema === "music-project-delivery-guard/review/v1" && record.subjectDigest === sourceDigest && record.mixSha256 === mixSha256 && record.decision === "approved";
}
async function releaseProject(inputRoot) {
  const root = resolve(inputRoot);
  const initial = await collectMusicModel(root);
  const sourceDigest = computeMusicSubjectDigest(initial);
  const findings = validateMusicModel(initial, { stage: "source" });
  if (findings.length > 0) {
    const first = findings[0];
    throw new Error(`SOURCE_CONTRACT_FAILED:${first?.code}:${first?.path}`);
  }
  const plan = JSON.parse(initial.files?.["plan.contract.json"] ?? "null");
  const planRecord = typeof plan === "object" && plan !== null ? plan : {};
  if (planRecord.targetStage !== "release") throw new Error("RELEASE_STAGE_NOT_REQUESTED");
  const paths = musicSourcePaths(initial);
  const mixPath = join(root, paths.mix);
  const mixBytes = await readFile(mixPath);
  const mixSha256 = sha256(mixBytes);
  let review;
  try {
    review = JSON.parse(initial.files?.["review.music.json"] ?? "null");
  } catch {
    review = null;
  }
  const reviewFindings = validateMusicReview(initial, { requireApproved: true });
  if (!validateListeningReview(review, { sourceDigest, mixSha256 }) || reviewFindings.length > 0) {
    throw new Error(`CURRENT_LISTENING_REVIEW_REQUIRED:${reviewFindings.map(({ code }) => code).join(",") || "BINDING_INVALID"}`);
  }
  const analysis = analyzePcm16Wav(mixBytes);
  const quality = assessQuality(analysis, initial.project?.quality ?? {});
  if (!quality.pass) throw new Error(`AUDIO_QUALITY_FAILED:${Object.entries(quality.checks).filter(([, pass]) => !pass).map(([name]) => name).join(",")}`);
  await mkdir(join(root, "dist"), { recursive: true });
  const journalPath = join(root, ".music-delivery-journal.json");
  const journal = await open(journalPath, "wx");
  await journal.writeFile(`${JSON.stringify({ schemaVersion: 1, plugin: "music-project-delivery-guard", operation: "release", sourceDigest, sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown" })}
`);
  await journal.sync();
  await journal.close();
  let complete = false;
  try {
    const distPath = join(root, "dist", `${initial.artifactId}.wav`);
    await copyFile(mixPath, distPath);
    const stemAnalysis = {};
    for (const stemPath of paths.proofs) stemAnalysis[stemPath] = analyzePcm16Wav(await readFile(join(root, stemPath)));
    await writeJsonAtomic(join(root, "evidence.audio.json"), {
      schema: "music-project-delivery-guard/audio-evidence/v1",
      plugin: "music-project-delivery-guard",
      engine: MUSIC_ENGINE,
      artifactId: initial.artifactId,
      sourceDigest,
      mixSha256,
      analysis,
      stems: stemAnalysis,
      quality
    });
    const beforeManifest = await collectMusicModel(root);
    await writeJsonAtomic(join(root, "release.manifest.json"), {
      schema: "music-project-delivery-guard/release/v2",
      engine: MUSIC_ENGINE,
      artifactId: initial.artifactId,
      sourceDigest,
      outputs: {
        [`dist/${initial.artifactId}.wav`]: beforeManifest.digests?.[`dist/${initial.artifactId}.wav`],
        "evidence.audio.json": beforeManifest.digests?.["evidence.audio.json"],
        "review.music.json": beforeManifest.digests?.["review.music.json"]
      }
    });
    const beforeReceipt = await collectMusicModel(root);
    await writeJsonAtomic(join(root, "receipt.release.json"), createMusicReceipt(beforeReceipt));
    const finalModel = await collectMusicModel(root);
    if (finalModel.files) delete finalModel.files[".music-delivery-journal.json"];
    if (finalModel.digests) delete finalModel.digests[".music-delivery-journal.json"];
    const releaseFindings = validateMusicModel(finalModel, { stage: "release" });
    if (releaseFindings.length > 0) {
      const first = releaseFindings[0];
      throw new Error(`RELEASE_CONTRACT_FAILED:${first?.code}:${first?.path}`);
    }
    complete = true;
    return { sourceDigest, distPath, evidencePath: join(root, "evidence.audio.json"), receiptPath: join(root, "receipt.release.json") };
  } finally {
    if (complete) await unlink(journalPath);
  }
}

export {
  encodePcm16Wav,
  analyzePcm16Wav,
  collectMusicModel,
  releaseProject
};
