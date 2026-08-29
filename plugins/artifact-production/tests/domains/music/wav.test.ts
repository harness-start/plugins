import assert from "node:assert/strict";
import test from "node:test";

import { analyzePcm16Wav, encodePcm16Wav } from "../../../src/domains/music/lib/wav.js";

test("encodes and independently analyzes a 48 kHz stereo PCM16 waveform", () => {
  const channel = Float32Array.from([0, 0.5, -0.5, 0]);
  const wav = encodePcm16Wav({ channels: [channel, channel], sampleRate: 48000 });
  const analysis = analyzePcm16Wav(wav);

  assert.equal(wav.byteLength, 60);
  assert.equal(analysis.sampleRate, 48000);
  assert.equal(analysis.channels, 2);
  assert.equal(analysis.frames, 4);
  assert.ok(Math.abs(analysis.peakDbfs - -6.0206) < 0.001);
  assert.equal(analysis.clippedSamples, 0);
});
