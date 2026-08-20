import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { compareVideoSimilarity, measureAudioLoudness, mediaToolVersion, probeMedia, validateMeasuredMedia } from "../src/lib/media.js";

function run(binary, args) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 30_000 }, (error, stdout, stderr) => error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout));
  });
}

test("real ffmpeg outputs satisfy measured visual, audio, and final contracts", {
  skip: process.env.SKIP_REAL_FFMPEG_TEST === "1",
}, async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-real-media-"));
  const visual = join(sandbox, "visual.mp4");
  const audio = join(sandbox, "audio.wav");
  const final = join(sandbox, "final.mp4");
  const project = { fps: 10, width: 160, height: 90 };
  try {
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=160x90:r=10:d=1", "-an", "-c:v", "mpeg4", "-y", visual]);
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1", "-c:a", "pcm_s16le", "-y", audio]);
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=160x90:r=10:d=1", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1", "-shortest", "-c:v", "mpeg4", "-c:a", "aac", "-y", final]);

    const visualFacts = await probeMedia(visual, { fps: 10 });
    const audioFacts = await probeMedia(audio, { fps: 10 });
    const finalFacts = await probeMedia(final, { fps: 10 });

    validateMeasuredMedia(visualFacts, { kind: "visual", project, expectedFrames: 10 });
    validateMeasuredMedia(audioFacts, { kind: "audio", project, expectedFrames: 10 });
    validateMeasuredMedia(finalFacts, { kind: "final", project, expectedFrames: 10 });
    const loudness = await measureAudioLoudness(final);
    assert.ok(Number.isFinite(loudness.integratedLufs));
    assert.ok(Number.isFinite(loudness.truePeakDb));
    const similarity = await compareVideoSimilarity(final, final);
    assert.ok(similarity.ssim >= 0.9999);
    assert.equal(similarity.psnr, Number.POSITIVE_INFINITY);
    assert.match(await mediaToolVersion("ffprobe"), /^ffprobe/u);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
