import { createHash } from "node:crypto";
import { copyFile, mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import { MUSIC_ENGINE, computeMusicSubjectDigest, createMusicReceipt, validateMusicModel } from "./contract.mjs";
import { analyzePcm16Wav } from "./wav.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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

export async function collectMusicModel(root) {
  const model = { artifactId: "", files: {}, digests: {}, project: null };
  await collect(root, root, model, { value: 0 });
  model.project = JSON.parse(model.files["music.project.json"] ?? "null");
  model.artifactId = basename(root);
  return model;
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporaryPath, filePath);
}

function assessQuality(analysis, quality) {
  const checks = {
    sampleRate: analysis.sampleRate === 48000,
    channels: analysis.channels === 2,
    peak: analysis.peakDbfs <= quality.maxPeakDbfs,
    rms: analysis.rmsDbfs >= quality.minRmsDbfs,
    dcOffset: Math.abs(analysis.dcOffset) <= quality.maxAbsDcOffset,
    clippedSamples: analysis.clippedSamples <= quality.maxClippedSamples,
    nonSilent: analysis.nonSilentRatio > 0,
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}

export function validateListeningReview(review, { sourceDigest, mixSha256 }) {
  if (typeof review !== "string") return false;
  const findings = review.match(/^findings:\s*(?<value>.+)$/mu)?.groups?.value.trim() ?? "";
  return new RegExp(`^sourceDigest: ${sourceDigest}$`, "mu").test(review)
    && new RegExp(`^mixSha256: ${mixSha256}$`, "mu").test(review)
    && /^method:\s*listened\s*$/mu.test(review)
    && findings.length > 0
    && !/^(?:<.*>|TODO|TBD)$/iu.test(findings);
}

export async function releaseProject(inputRoot) {
  const root = resolve(inputRoot);
  const initial = await collectMusicModel(root);
  const sourceDigest = computeMusicSubjectDigest(initial);
  const findings = validateMusicModel(initial, { stage: "source" });
  if (findings.length > 0) throw new Error(`SOURCE_CONTRACT_FAILED:${findings[0].code}:${findings[0].path}`);
  const plan = JSON.parse(initial.files["plan.contract.json"] ?? "null");
  if (plan?.targetStage !== "release") throw new Error("RELEASE_STAGE_NOT_REQUESTED");
  const mixPath = join(root, "build", `mix.${sourceDigest}.wav`);
  const mixBytes = await readFile(mixPath);
  const mixSha256 = sha256(mixBytes);
  const review = initial.files["review/music-review.md"] ?? "";
  if (!validateListeningReview(review, { sourceDigest, mixSha256 })) {
    throw new Error("CURRENT_LISTENING_REVIEW_REQUIRED");
  }
  const analysis = analyzePcm16Wav(mixBytes);
  const quality = assessQuality(analysis, initial.project.quality ?? {});
  if (!quality.pass) throw new Error(`AUDIO_QUALITY_FAILED:${Object.entries(quality.checks).filter(([, pass]) => !pass).map(([name]) => name).join(",")}`);
  await mkdir(join(root, "dist"), { recursive: true });
  const journalPath = join(root, ".music-delivery-journal.json");
  const journal = await open(journalPath, "wx");
  await journal.writeFile(`${JSON.stringify({ schemaVersion: 1, plugin: "tonejs-music-production", operation: "release", sourceDigest, sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown" })}\n`);
  await journal.sync();
  await journal.close();
  let complete = false;
  try {
    const distPath = join(root, "dist", `${initial.artifactId}.wav`);
    await copyFile(mixPath, distPath);
    await writeJsonAtomic(join(root, "evidence.audio.json"), {
      schema: "tonejs-audio-evidence/v1",
      plugin: "tonejs-music-production",
      engine: MUSIC_ENGINE,
      artifactId: initial.artifactId,
      sourceDigest,
      mixSha256,
      analysis,
      quality,
    });
    const beforeManifest = await collectMusicModel(root);
    await writeJsonAtomic(join(root, "release.manifest.json"), {
      schema: "tonejs-music-release/v1",
      engine: MUSIC_ENGINE,
      artifactId: initial.artifactId,
      sourceDigest,
      outputs: {
        [`dist/${initial.artifactId}.wav`]: beforeManifest.digests[`dist/${initial.artifactId}.wav`],
        "evidence.audio.json": beforeManifest.digests["evidence.audio.json"],
        "review/music-review.md": beforeManifest.digests["review/music-review.md"],
      },
    });
    const beforeReceipt = await collectMusicModel(root);
    await writeJsonAtomic(join(root, "receipt.release.json"), createMusicReceipt(beforeReceipt));
    const finalModel = await collectMusicModel(root);
    delete finalModel.files[".music-delivery-journal.json"];
    delete finalModel.digests[".music-delivery-journal.json"];
    const releaseFindings = validateMusicModel(finalModel, { stage: "release" });
    if (releaseFindings.length > 0) throw new Error(`RELEASE_CONTRACT_FAILED:${releaseFindings[0].code}:${releaseFindings[0].path}`);
    complete = true;
    return { sourceDigest, distPath, evidencePath: join(root, "evidence.audio.json"), receiptPath: join(root, "receipt.release.json") };
  } finally {
    if (complete) await unlink(journalPath);
  }
}
