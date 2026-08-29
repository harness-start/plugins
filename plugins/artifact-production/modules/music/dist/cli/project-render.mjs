#!/usr/bin/env node
// harness-source-hash: sha256:fc7c19bc4d8914439d6e3416e5710ae537c4947f54691186a3b2c9462eaf8ea2
import {
  collectMusicModel,
  encodePcm16Wav
} from "../chunks/chunk-CDUGBIPI.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "../chunks/chunk-S6S44ZCC.mjs";
import {
  computeMusicSubjectDigest
} from "../chunks/chunk-MYMZ3E4E.mjs";

// plugins/artifact-production/modules/music/src/entries/cli/project-render.ts
import { resolve as resolve2 } from "node:path";

// plugins/artifact-production/modules/music/src/lib/browser-renderer.ts
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
function moduleSpecifier(value) {
  return value.startsWith("./") ? value : `./${value}`;
}
function createBrowserEntry(project) {
  const tracks = project.tracks ?? [];
  const imports = tracks.map((track, index) => `import { createInstrument as createInstrument${index} } from ${JSON.stringify(moduleSpecifier(track.instrument ?? ""))};`);
  const factories = tracks.map((track, index) => `${JSON.stringify(track.id)}: createInstrument${index}`).join(",\n  ");
  return `import * as Tone from "tone";
${imports.join("\n")}

const factories = {
  ${factories}
};

globalThis.__tonejsRender = async ({ project, score, trackId }) => {
  const quarterSeconds = 60 / score.bpm;
  const durationSeconds = score.bars * score.timeSignature[0] * (4 / score.timeSignature[1]) * quarterSeconds + project.tailSeconds;
  const buffer = await Tone.Offline(() => {
    const limiter = new Tone.Limiter(-1).toDestination();
    const mixBus = new Tone.Gain(Tone.dbToGain(-6)).connect(limiter);
    for (const track of score.tracks) {
      if (trackId !== null && track.id !== trackId) continue;
      const factory = factories[track.id];
      if (!factory) throw new Error(\`INSTRUMENT_FACTORY_MISSING:\${track.id}\`);
      const instrument = factory({ Tone, output: mixBus });
      for (const event of track.events) {
        const start = event.startTick / score.ppq * quarterSeconds;
        const duration = event.durationTick / score.ppq * quarterSeconds;
        instrument.triggerAttackRelease(Tone.Frequency(event.midi, "midi"), duration, start, event.velocity / 127);
      }
    }
  }, durationSeconds, project.channels, project.sampleRate);
  const chunkFrames = 16384;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let offset = 0; offset < data.length; offset += chunkFrames) {
      await globalThis.__tonejsChunk({ channel, totalFrames: data.length, offset, samples: Array.from(data.subarray(offset, offset + chunkFrames)) });
    }
  }
  return {
    sampleRate: buffer.sampleRate,
    channelCount: buffer.numberOfChannels,
    frames: buffer.length,
  };
};
`;
}
async function loadProjectDependency(root2, name) {
  const require2 = createRequire(join(root2, "package.json"));
  const loaded = await import(pathToFileURL(require2.resolve(name)).href);
  return loaded.default ?? loaded;
}
function asEsbuild(value) {
  const record = typeof value === "object" && value !== null ? value : {};
  if (typeof record.build !== "function") throw new Error("ESBUILD_UNAVAILABLE");
  return { build: record.build };
}
function asPlaywright(value) {
  const record = typeof value === "object" && value !== null ? value : {};
  if (!record.chromium) throw new Error("PLAYWRIGHT_UNAVAILABLE");
  return { chromium: record.chromium };
}
function createToneBrowserRenderer() {
  return async function renderAudio({ root: root2, project, score, trackId }) {
    const numerator = score.timeSignature[0] ?? 0;
    const denominator = score.timeSignature[1] ?? 1;
    const durationSeconds = score.bars * numerator * (4 / denominator) * 60 / score.bpm + (project.tailSeconds ?? 0);
    const eventCount = score.tracks.reduce((sum, track) => sum + track.events.length, 0);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 210) throw new Error("RENDER_DURATION_LIMIT_EXCEEDED");
    if (score.tracks.length > 8 || eventCount > 2e5) throw new Error("RENDER_COMPLEXITY_LIMIT_EXCEEDED");
    const [{ build }, { chromium }] = await Promise.all([
      loadProjectDependency(root2, "esbuild").then(asEsbuild),
      loadProjectDependency(root2, "playwright").then(asPlaywright)
    ]);
    const result = await build({
      stdin: {
        contents: createBrowserEntry(project),
        loader: "js",
        resolveDir: root2,
        sourcefile: "tonejs-offline-entry.mjs"
      },
      bundle: true,
      format: "iife",
      platform: "browser",
      write: false,
      logLevel: "silent"
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.route("**/*", (route) => route.abort());
      await page.setContent("<!doctype html><meta charset=utf-8><title>Tone.js Offline Render</title>");
      const rendered = { channels: null };
      await page.exposeFunction("__tonejsChunk", ({ channel, totalFrames, offset, samples }) => {
        if (!rendered.channels) rendered.channels = Array.from({ length: project.channels ?? 0 }, () => new Float32Array(totalFrames));
        const target = rendered.channels[channel];
        if (!target || target.length !== totalFrames || offset < 0 || offset + samples.length > totalFrames) throw new Error("RENDER_CHUNK_INVALID");
        target.set(samples, offset);
      });
      const bundled = result.outputFiles[0];
      if (!bundled) throw new Error("RENDER_BUNDLE_EMPTY");
      await page.addScriptTag({ content: bundled.text });
      const value = await page.evaluate(async (input) => {
        const holder = globalThis;
        if (typeof holder.__tonejsRender !== "function") throw new Error("RENDER_ENTRY_MISSING");
        return holder.__tonejsRender(input);
      }, { project, score, trackId });
      const channels = rendered.channels;
      const firstChannel = channels?.[0];
      if (!channels || value.channelCount !== channels.length || !firstChannel || value.frames !== firstChannel.length) throw new Error("RENDER_CHUNKS_INCOMPLETE");
      return {
        sampleRate: value.sampleRate,
        channels
      };
    } finally {
      await browser.close();
    }
  };
}

// plugins/artifact-production/modules/music/src/lib/renderer.ts
import { createHash } from "node:crypto";
import { open, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join as join2, relative, resolve } from "node:path";
async function collectSource(root2, directory, files, count) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp", "build", "proofs", "dist", "review"].includes(entry.name)) continue;
    const absolute = join2(directory, entry.name);
    if (entry.isDirectory()) {
      await collectSource(root2, absolute, files, count);
    } else if (entry.isFile()) {
      count.value += 1;
      if (count.value > 4096) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
      const filePath = relative(root2, absolute).replaceAll("\\", "/");
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
  if (audio.sampleRate !== project.sampleRate) throw new Error("RENDER_SAMPLE_RATE_MISMATCH");
  if (!Array.isArray(audio.channels) || audio.channels.length !== project.channels) throw new Error("RENDER_CHANNEL_COUNT_MISMATCH");
  if (audio.channels.some((channel) => !(channel instanceof Float32Array))) throw new Error("RENDER_CHANNEL_DATA_INVALID");
}
function asProject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
function asScore(value) {
  const record = typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
  return {
    ...record,
    bpm: Number(record.bpm),
    bars: Number(record.bars),
    timeSignature: Array.isArray(record.timeSignature) ? record.timeSignature : [],
    tracks: Array.isArray(record.tracks) ? record.tracks : [],
    ...typeof record.ppq === "number" ? { ppq: record.ppq } : {}
  };
}
async function renderProject({ root: inputRoot, renderAudio }) {
  if (typeof renderAudio !== "function") throw new Error("RENDER_BOUNDARY_REQUIRED");
  const root2 = resolve(inputRoot);
  const files = {};
  await collectSource(root2, root2, files, { value: 0 });
  const project = asProject(JSON.parse(files["music.project.json"] ?? "null"));
  const sourceDigest = computeMusicSubjectDigest({ artifactId: basename(root2), files, project });
  const scorePath = join2(root2, "build", `score.${sourceDigest}.json`);
  const metricsPath = join2(root2, "build", `metrics.${sourceDigest}.json`);
  const [scoreBytes, metricsBytes] = await Promise.all([readFile(scorePath), readFile(metricsPath)]);
  const parsedScore = JSON.parse(scoreBytes.toString("utf8"));
  const score = asScore(parsedScore);
  if (score.schema !== "tonejs-symbolic-score/v1" || score.sourceDigest !== sourceDigest) throw new Error("CURRENT_SCORE_REQUIRED");
  const buildRoot = join2(root2, "build");
  const proofsRoot = join2(root2, "proofs");
  await Promise.all([mkdir(buildRoot, { recursive: true }), mkdir(proofsRoot, { recursive: true })]);
  const journalPath = join2(root2, ".music-delivery-journal.json");
  const journal = await open(journalPath, "wx");
  await journal.writeFile(`${JSON.stringify({
    schemaVersion: 1,
    plugin: "music-production",
    operation: "render",
    sourceDigest,
    sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown"
  })}
`);
  await journal.sync();
  await journal.close();
  let complete = false;
  try {
    const proofPaths = [];
    const outputDigests = {
      [`build/score.${sourceDigest}.json`]: createHash("sha256").update(scoreBytes).digest("hex"),
      [`build/metrics.${sourceDigest}.json`]: createHash("sha256").update(metricsBytes).digest("hex")
    };
    for (const track of project.tracks ?? []) {
      const audio = await renderAudio({ root: root2, project, score, trackId: track.id ?? null });
      validateAudio(audio, project);
      const filePath = join2(proofsRoot, `t${String(track.index).padStart(3, "0")}-${track.role}-${track.id}.${sourceDigest}.wav`);
      const wav = encodePcm16Wav(audio);
      await writeAtomic(filePath, wav);
      outputDigests[relative(root2, filePath).replaceAll("\\", "/")] = createHash("sha256").update(wav).digest("hex");
      proofPaths.push(filePath);
    }
    const mixAudio = await renderAudio({ root: root2, project, score, trackId: null });
    validateAudio(mixAudio, project);
    const mixPath = join2(buildRoot, `mix.${sourceDigest}.wav`);
    const mixWav = encodePcm16Wav(mixAudio);
    await writeAtomic(mixPath, mixWav);
    outputDigests[`build/mix.${sourceDigest}.wav`] = createHash("sha256").update(mixWav).digest("hex");
    const orderedOutputs = Object.fromEntries([
      `build/score.${sourceDigest}.json`,
      `build/metrics.${sourceDigest}.json`,
      `build/mix.${sourceDigest}.wav`,
      ...proofPaths.map((filePath) => relative(root2, filePath).replaceAll("\\", "/"))
    ].map((filePath) => [filePath, outputDigests[filePath]]));
    const renderReceiptPath = join2(buildRoot, `render.${sourceDigest}.json`);
    await writeAtomic(renderReceiptPath, `${JSON.stringify({
      schema: "tonejs-render-receipt/v1",
      plugin: "music-production",
      engine: "Tone.Offline",
      sourceDigest,
      sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown",
      outputs: orderedOutputs
    }, null, 2)}
`);
    complete = true;
    return { sourceDigest, proofPaths, mixPath, renderReceiptPath };
  } finally {
    if (complete) await unlink(journalPath);
  }
}

// plugins/artifact-production/modules/music/src/entries/cli/project-render.ts
var root = resolve2(process.argv[2] ?? process.cwd());
Promise.all([
  consumeMusicWriterCapability({ root, capability: "music-render", argv: processMusicWriterArgv() }),
  collectMusicModel(root)
]).then(([grant, model]) => {
  if (grant.subjectDigest !== computeMusicSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  process.env.AI_EXPERTS_SESSION_ID = grant.sessionId;
  return renderProject({ root, renderAudio: createToneBrowserRenderer() });
}).then((result) => process.stdout.write(`${JSON.stringify(result)}
`)).catch((error) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[music-project-render] ${message}
`);
  process.exitCode = 2;
});
