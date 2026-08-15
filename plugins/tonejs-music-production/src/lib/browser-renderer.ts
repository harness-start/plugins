import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

function moduleSpecifier(value) {
  return value.startsWith("./") ? value : `./${value}`;
}

export function createBrowserEntry(project) {
  const imports = project.tracks.map((track, index) => (
    `import { createInstrument as createInstrument${index} } from ${JSON.stringify(moduleSpecifier(track.instrument))};`
  ));
  const factories = project.tracks.map((track, index) => `${JSON.stringify(track.id)}: createInstrument${index}`).join(",\n  ");
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

async function loadProjectDependency(root, name) {
  const require = createRequire(join(root, "package.json"));
  const loaded = await import(pathToFileURL(require.resolve(name)).href);
  return loaded.default ?? loaded;
}

export function createToneBrowserRenderer() {
  return async function renderAudio({ root, project, score, trackId }) {
    const durationSeconds = score.bars * score.timeSignature[0] * (4 / score.timeSignature[1]) * 60 / score.bpm + project.tailSeconds;
    const eventCount = score.tracks.reduce((sum, track) => sum + track.events.length, 0);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 210) throw new Error("RENDER_DURATION_LIMIT_EXCEEDED");
    if (score.tracks.length > 8 || eventCount > 200000) throw new Error("RENDER_COMPLEXITY_LIMIT_EXCEEDED");
    const [{ build }, { chromium }] = await Promise.all([
      loadProjectDependency(root, "esbuild"),
      loadProjectDependency(root, "playwright"),
    ]);
    const result = await build({
      stdin: {
        contents: createBrowserEntry(project),
        loader: "js",
        resolveDir: root,
        sourcefile: "tonejs-offline-entry.mjs",
      },
      bundle: true,
      format: "iife",
      platform: "browser",
      write: false,
      logLevel: "silent",
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.route("**/*", (route) => route.abort());
      await page.setContent("<!doctype html><meta charset=utf-8><title>Tone.js Offline Render</title>");
      let channels = null;
      await page.exposeFunction("__tonejsChunk", ({ channel, totalFrames, offset, samples }) => {
        if (!channels) channels = Array.from({ length: project.channels }, () => new Float32Array(totalFrames));
        if (!channels[channel] || channels[channel].length !== totalFrames || offset < 0 || offset + samples.length > totalFrames) throw new Error("RENDER_CHUNK_INVALID");
        channels[channel].set(samples, offset);
      });
      await page.addScriptTag({ content: result.outputFiles[0].text });
      const value = await page.evaluate(async (input) => globalThis.__tonejsRender(input), { project, score, trackId });
      if (!channels || value.channelCount !== channels.length || value.frames !== channels[0].length) throw new Error("RENDER_CHUNKS_INCOMPLETE");
      return {
        sampleRate: value.sampleRate,
        channels,
      };
    } finally {
      await browser.close();
    }
  };
}
