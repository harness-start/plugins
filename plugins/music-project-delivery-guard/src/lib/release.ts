import { createHash } from "node:crypto";
import { copyFile, mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import { MUSIC_ENGINE, computeMusicSubjectDigest, createMusicReceipt, musicSourcePaths, validateMusicModel, validateMusicReview, type MusicFileMap, type MusicModel, type MusicProjectConfig, type MusicQualityConfig } from "./contract.js";
import { analyzePcm16Wav, type WavAnalysis } from "./wav.js";

const sha256 = (value: string | NodeJS.ArrayBufferView) => createHash("sha256").update(value).digest("hex");

async function collect(root: string, directory: string, model: Required<Pick<MusicModel, "files" | "digests">> & MusicModel, count: { value: number }) {
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

function asProject(value: unknown): MusicProjectConfig | null {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  return value as MusicProjectConfig;
}

export async function collectMusicModel(root: string): Promise<MusicModel> {
  const model: MusicModel & { files: MusicFileMap; digests: Record<string, string> } = { artifactId: "", files: {}, digests: {}, project: null };
  await collect(root, root, model, { value: 0 });
  model.project = asProject(JSON.parse(model.files["music.project.json"] ?? "null") as unknown);
  model.artifactId = basename(root);
  return model;
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporaryPath, filePath);
}

function assessQuality(analysis: WavAnalysis, quality: MusicQualityConfig) {
  const checks = {
    sampleRate: analysis.sampleRate === 48000,
    channels: analysis.channels === 2,
    peak: analysis.peakDbfs <= (quality.maxPeakDbfs as number),
    rms: analysis.rmsDbfs >= (quality.minRmsDbfs as number),
    dcOffset: Math.abs(analysis.dcOffset) <= (quality.maxAbsDcOffset as number),
    clippedSamples: analysis.clippedSamples <= (quality.maxClippedSamples as number),
    nonSilent: analysis.nonSilentRatio > 0,
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}

export function validateListeningReview(review: unknown, { sourceDigest, mixSha256 }: {
  sourceDigest: string;
  mixSha256: string;
}) {
  if (typeof review !== "object" || review === null || Array.isArray(review)) return false;
  const record = review as Record<string, unknown>;
  return record.schema === "music-project-delivery-guard/review/v1" && record.subjectDigest === sourceDigest && record.mixSha256 === mixSha256 && record.decision === "approved";
}

export async function releaseProject(inputRoot: string) {
  const root = resolve(inputRoot);
  const initial = await collectMusicModel(root);
  const sourceDigest = computeMusicSubjectDigest(initial);
  const findings = validateMusicModel(initial, { stage: "source" });
  if (findings.length > 0) {
    const first = findings[0];
    throw new Error(`SOURCE_CONTRACT_FAILED:${first?.code}:${first?.path}`);
  }
  const plan: unknown = JSON.parse(initial.files?.["plan.contract.json"] ?? "null");
  const planRecord = typeof plan === "object" && plan !== null ? plan as Record<string, unknown> : {};
  if (planRecord.targetStage !== "release") throw new Error("RELEASE_STAGE_NOT_REQUESTED");
  const paths = musicSourcePaths(initial);
  const mixPath = join(root, paths.mix);
  const mixBytes = await readFile(mixPath);
  const mixSha256 = sha256(mixBytes);
  let review: unknown;
  try { review = JSON.parse(initial.files?.["review.music.json"] ?? "null") as unknown; } catch { review = null; }
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
  await journal.writeFile(`${JSON.stringify({ schemaVersion: 1, plugin: "music-project-delivery-guard", operation: "release", sourceDigest, sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown" })}\n`);
  await journal.sync();
  await journal.close();
  let complete = false;
  try {
    const distPath = join(root, "dist", `${initial.artifactId}.wav`);
    await copyFile(mixPath, distPath);
    const stemAnalysis: Record<string, unknown> = {};
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
      quality,
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
        "review.music.json": beforeManifest.digests?.["review.music.json"],
      },
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
