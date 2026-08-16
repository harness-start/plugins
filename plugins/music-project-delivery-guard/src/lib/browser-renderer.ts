import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

import type { MusicProjectConfig } from "./contract.js";
import type { RenderAudio, RenderAudioInput, RenderAudioResult } from "./renderer.js";

function moduleSpecifier(value: string) {
  return value.startsWith("./") ? value : `./${value}`;
}

export function createBrowserEntry(project: Pick<MusicProjectConfig, "tracks">) {
  const tracks = project.tracks ?? [];
  const imports = tracks.map((track, index) => (
    `import { createInstrument as createInstrument${index} } from ${JSON.stringify(moduleSpecifier(track.instrument ?? ""))};`
  ));
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

type EsbuildBuild = (options: Record<string, unknown>) => Promise<{ outputFiles: Array<{ text: string }> }>;
type PlaywrightPage = {
  route: (pattern: string, handler: (route: { abort: () => unknown }) => unknown) => Promise<unknown>;
  setContent: (html: string) => Promise<unknown>;
  exposeFunction: (name: string, fn: (payload: { channel: number; totalFrames: number; offset: number; samples: number[] }) => void) => Promise<unknown>;
  addScriptTag: (options: { content: string }) => Promise<unknown>;
  evaluate: <T, A>(fn: (input: A) => Promise<T> | T, arg: A) => Promise<T>;
  goto?: (url: string) => Promise<unknown>;
};
type PlaywrightBrowser = {
  newPage: () => Promise<PlaywrightPage>;
  close: () => Promise<unknown>;
  on?: (event: "disconnected", listener: () => void) => unknown;
};
type PlaywrightChromium = {
  launch: (options: { headless: boolean }) => Promise<PlaywrightBrowser>;
};

async function loadProjectDependency(root: string, name: string): Promise<unknown> {
  const require = createRequire(join(root, "package.json"));
  const loaded = await import(pathToFileURL(require.resolve(name)).href);
  return loaded.default ?? loaded;
}

function asEsbuild(value: unknown): { build: EsbuildBuild } {
  const record = typeof value === "object" && value !== null ? value as { build?: EsbuildBuild } : {};
  if (typeof record.build !== "function") throw new Error("ESBUILD_UNAVAILABLE");
  return { build: record.build };
}

function asPlaywright(value: unknown): { chromium: PlaywrightChromium } {
  const record = typeof value === "object" && value !== null ? value as { chromium?: PlaywrightChromium } : {};
  if (!record.chromium) throw new Error("PLAYWRIGHT_UNAVAILABLE");
  return { chromium: record.chromium };
}

export function createToneBrowserRenderer(): RenderAudio {
  return async function renderAudio({ root, project, score, trackId }: RenderAudioInput): Promise<RenderAudioResult> {
    const numerator = score.timeSignature[0] ?? 0;
    const denominator = score.timeSignature[1] ?? 1;
    const durationSeconds = score.bars * numerator * (4 / denominator) * 60 / score.bpm + (project.tailSeconds ?? 0);
    const eventCount = score.tracks.reduce((sum: number, track) => sum + track.events.length, 0);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 210) throw new Error("RENDER_DURATION_LIMIT_EXCEEDED");
    if (score.tracks.length > 8 || eventCount > 200000) throw new Error("RENDER_COMPLEXITY_LIMIT_EXCEEDED");
    const [{ build }, { chromium }] = await Promise.all([
      loadProjectDependency(root, "esbuild").then(asEsbuild),
      loadProjectDependency(root, "playwright").then(asPlaywright),
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
      const rendered: { channels: Float32Array[] | null } = { channels: null };
      await page.exposeFunction("__tonejsChunk", ({ channel, totalFrames, offset, samples }: {
        channel: number;
        totalFrames: number;
        offset: number;
        samples: number[];
      }) => {
        if (!rendered.channels) rendered.channels = Array.from({ length: project.channels ?? 0 }, () => new Float32Array(totalFrames));
        const target = rendered.channels[channel];
        if (!target || target.length !== totalFrames || offset < 0 || offset + samples.length > totalFrames) throw new Error("RENDER_CHUNK_INVALID");
        target.set(samples, offset);
      });
      const bundled = result.outputFiles[0];
      if (!bundled) throw new Error("RENDER_BUNDLE_EMPTY");
      await page.addScriptTag({ content: bundled.text });
      type TonejsRenderPayload = {
        project: MusicProjectConfig;
        score: RenderAudioInput["score"];
        trackId: string | null;
      };
      const value = await page.evaluate(async (input: TonejsRenderPayload) => {
        const holder = globalThis as typeof globalThis & {
          __tonejsRender?: (payload: TonejsRenderPayload) => Promise<{ sampleRate: number; channelCount: number; frames: number }>;
        };
        if (typeof holder.__tonejsRender !== "function") throw new Error("RENDER_ENTRY_MISSING");
        return holder.__tonejsRender(input);
      }, { project, score, trackId });
      const channels = rendered.channels;
      const firstChannel = channels?.[0];
      if (!channels || value.channelCount !== channels.length || !firstChannel || value.frames !== firstChannel.length) throw new Error("RENDER_CHUNKS_INCOMPLETE");
      return {
        sampleRate: value.sampleRate,
        channels,
      };
    } finally {
      await browser.close();
    }
  };
}
