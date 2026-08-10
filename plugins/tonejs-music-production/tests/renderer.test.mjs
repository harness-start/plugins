import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { renderProject } from "../scripts/lib/renderer.mjs";
import { analyzePcm16Wav } from "../scripts/lib/wav.mjs";

test("writes current-digest stem and mix WAV files from the browser render boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "tonejs-render-"));
  try {
    await mkdir(join(root, "src", "instruments"), { recursive: true });
    const sourceFiles = {
      ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
      "package.json": "{}\n",
      "package-lock.json": "{}\n",
      "plan.contract.json": JSON.stringify({ targetStage: "source" }),
      "music.project.json": JSON.stringify({
        schema: "tonejs-music-project/v1",
        artifactId: "study",
        sampleRate: 48000,
        channels: 2,
        tracks: [{ index: 1, id: "lead", role: "melody", instrument: "src/instruments/lead.mjs" }],
      }),
      "src/composition.mjs": "export default {};\n",
      "src/instruments/lead.mjs": "export function createInstrument() {}\n",
    };
    await Promise.all(Object.entries(sourceFiles).map(async ([filePath, value]) => {
      const absolute = join(root, filePath);
      await mkdir(join(absolute, ".."), { recursive: true });
      await writeFile(absolute, value);
    }));
    const { computeMusicSubjectDigest } = await import("../scripts/lib/contract.mjs");
    const project = JSON.parse(sourceFiles["music.project.json"]);
    const sourceDigest = computeMusicSubjectDigest({ artifactId: "study", files: sourceFiles, project });
    await mkdir(join(root, "build"), { recursive: true });
    await writeFile(join(root, "build", `score.${sourceDigest}.json`), JSON.stringify({
      schema: "tonejs-symbolic-score/v1",
      sourceDigest,
      ppq: 960,
      bpm: 120,
      bars: 1,
      timeSignature: [4, 4],
      tracks: [{ id: "lead", role: "melody", instrument: "src/instruments/lead.mjs", events: [] }],
    }));
    await writeFile(join(root, "build", `metrics.${sourceDigest}.json`), JSON.stringify({ schema: "tonejs-music-metrics/v1", sourceDigest }));
    const renderAudio = async () => ({
      sampleRate: 48000,
      channels: [Float32Array.from([0, 0.25, -0.25, 0]), Float32Array.from([0, 0.25, -0.25, 0])],
    });

    const result = await renderProject({ root, renderAudio });
    const mix = analyzePcm16Wav(await readFile(result.mixPath));

    assert.equal(result.sourceDigest, sourceDigest);
    assert.equal(result.proofPaths.length, 1);
    assert.ok(result.renderReceiptPath.endsWith(`render.${sourceDigest}.json`));
    assert.equal(mix.sampleRate, 48000);
    assert.ok(mix.rmsDbfs > -20);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
