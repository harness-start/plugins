import { createHash } from "node:crypto";
import { open, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import { computeMusicSubjectDigest } from "./contract.mjs";
import { encodePcm16Wav } from "./wav.mjs";

async function collectSource(root, directory, files, count) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp", "build", "proofs", "dist", "review"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectSource(root, absolute, files, count);
    } else if (entry.isFile()) {
      count.value += 1;
      if (count.value > 4096) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      files[filePath] = (await readFile(absolute)).toString("utf8");
    }
  }
}

async function writeAtomic(filePath, bytes) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, bytes, { flag: "wx" });
  await rename(temporaryPath, filePath);
}

function validateAudio(audio, project) {
  if (audio?.sampleRate !== project.sampleRate) throw new Error("RENDER_SAMPLE_RATE_MISMATCH");
  if (!Array.isArray(audio?.channels) || audio.channels.length !== project.channels) throw new Error("RENDER_CHANNEL_COUNT_MISMATCH");
  if (audio.channels.some((channel) => !(channel instanceof Float32Array))) throw new Error("RENDER_CHANNEL_DATA_INVALID");
}

export async function renderProject({ root: inputRoot, renderAudio }) {
  if (typeof renderAudio !== "function") throw new Error("RENDER_BOUNDARY_REQUIRED");
  const root = resolve(inputRoot);
  const files = {};
  await collectSource(root, root, files, { value: 0 });
  const project = JSON.parse(files["music.project.json"] ?? "null");
  const sourceDigest = computeMusicSubjectDigest({ artifactId: basename(root), files, project });
  const scorePath = join(root, "build", `score.${sourceDigest}.json`);
  const metricsPath = join(root, "build", `metrics.${sourceDigest}.json`);
  const [scoreBytes, metricsBytes] = await Promise.all([readFile(scorePath), readFile(metricsPath)]);
  const score = JSON.parse(scoreBytes.toString("utf8"));
  if (score?.schema !== "tonejs-symbolic-score/v1" || score?.sourceDigest !== sourceDigest) throw new Error("CURRENT_SCORE_REQUIRED");
  const buildRoot = join(root, "build");
  const proofsRoot = join(root, "proofs");
  await Promise.all([mkdir(buildRoot, { recursive: true }), mkdir(proofsRoot, { recursive: true })]);
  const journalPath = join(root, ".music-delivery-journal.json");
  const journal = await open(journalPath, "wx");
  await journal.writeFile(`${JSON.stringify({
    schemaVersion: 1,
    plugin: "tonejs-music-production",
    operation: "render",
    sourceDigest,
    sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown",
  })}\n`);
  await journal.sync();
  await journal.close();
  let complete = false;
  try {
    const proofPaths = [];
    const outputDigests = {
      [`build/score.${sourceDigest}.json`]: createHash("sha256").update(scoreBytes).digest("hex"),
      [`build/metrics.${sourceDigest}.json`]: createHash("sha256").update(metricsBytes).digest("hex"),
    };
    for (const track of project.tracks) {
      const audio = await renderAudio({ root, project, score, trackId: track.id });
      validateAudio(audio, project);
      const filePath = join(proofsRoot, `t${String(track.index).padStart(3, "0")}-${track.role}-${track.id}.${sourceDigest}.wav`);
      const wav = encodePcm16Wav(audio);
      await writeAtomic(filePath, wav);
      outputDigests[relative(root, filePath).replaceAll("\\", "/")] = createHash("sha256").update(wav).digest("hex");
      proofPaths.push(filePath);
    }
    const mixAudio = await renderAudio({ root, project, score, trackId: null });
    validateAudio(mixAudio, project);
    const mixPath = join(buildRoot, `mix.${sourceDigest}.wav`);
    const mixWav = encodePcm16Wav(mixAudio);
    await writeAtomic(mixPath, mixWav);
    outputDigests[`build/mix.${sourceDigest}.wav`] = createHash("sha256").update(mixWav).digest("hex");
    const orderedOutputs = Object.fromEntries([
      `build/score.${sourceDigest}.json`,
      `build/metrics.${sourceDigest}.json`,
      `build/mix.${sourceDigest}.wav`,
      ...proofPaths.map((filePath) => relative(root, filePath).replaceAll("\\", "/")),
    ].map((filePath) => [filePath, outputDigests[filePath]]));
    const renderReceiptPath = join(buildRoot, `render.${sourceDigest}.json`);
    await writeAtomic(renderReceiptPath, `${JSON.stringify({ schema: "tonejs-render-receipt/v1", sourceDigest, outputs: orderedOutputs }, null, 2)}\n`);
    complete = true;
    return { sourceDigest, proofPaths, mixPath, renderReceiptPath };
  } finally {
    if (complete) await unlink(journalPath);
  }
}
