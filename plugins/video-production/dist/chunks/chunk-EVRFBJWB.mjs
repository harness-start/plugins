// harness-source-hash: sha256:76d7789e2465588d1bd1394d140e4ff1d0a1104b623f16f49e98aa66c400df25

// plugins/video-production/src/lib/media.ts
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
function runCaptured(binary, args, { cwd, maxBytes = 16 * 1024 * 1024, timeoutMs = 3e4 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) reject(new Error(`MEDIA_TOOL_TIMEOUT:${binary}`));
      settled = true;
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maxBytes) child.kill("SIGKILL");
      else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes <= maxBytes) stderr.push(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) reject(new Error(`MEDIA_TOOL_UNAVAILABLE:${binary}:${error.message}`));
      settled = true;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (stdoutBytes > maxBytes) {
        reject(new Error(`MEDIA_TOOL_OUTPUT_LIMIT:${binary}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`MEDIA_TOOL_FAILED:${binary}:${Buffer.concat(stderr).toString("utf8").trim()}`));
        return;
      }
      resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    });
  });
}
async function run(binary, args, options = {}) {
  return (await runCaptured(binary, args, options)).stdout;
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function ratio(value) {
  const parts = String(value ?? "").split("/").map(Number);
  const numerator = parts[0] ?? Number.NaN;
  const denominator = parts[1] ?? Number("1");
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator;
}
async function mediaToolVersion(binary = "ffprobe") {
  const output = await run(binary, ["-version"], { maxBytes: 1024 * 1024 });
  return (output.toString("utf8").split(/\r?\n/u)[0] ?? "").trim();
}
async function probeMedia(filePath, { fps, ffprobe = "ffprobe", cwd } = {}) {
  const output = await run(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath], { cwd });
  let payload;
  try {
    payload = JSON.parse(output.toString("utf8"));
  } catch {
    throw new Error("FFPROBE_JSON_INVALID");
  }
  const payloadRecord = isRecord(payload) ? payload : {};
  const streams = Array.isArray(payloadRecord.streams) ? payloadRecord.streams.filter(isRecord) : [];
  const video = streams.find((stream) => stream.codec_type === "video") ?? null;
  const audio = streams.find((stream) => stream.codec_type === "audio") ?? null;
  const measuredFps = video ? ratio(video.avg_frame_rate || video.r_frame_rate) : Number(fps);
  const formatRecord = isRecord(payloadRecord.format) ? payloadRecord.format : void 0;
  const durationSeconds = Number(formatRecord?.duration ?? video?.duration ?? audio?.duration);
  const durationInFrames = Number.isFinite(durationSeconds) && Number.isFinite(measuredFps) ? Math.round(durationSeconds * measuredFps) : Number(video?.nb_frames);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isInteger(durationInFrames) || durationInFrames <= 0) throw new Error("MEDIA_DURATION_INVALID");
  return {
    format: String(formatRecord?.format_name ?? ""),
    durationSeconds,
    durationInFrames,
    fps: measuredFps,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    width: Number(video?.width ?? 0),
    height: Number(video?.height ?? 0),
    videoCodec: video?.codec_name == null ? null : String(video.codec_name),
    audioCodec: audio?.codec_name == null ? null : String(audio.codec_name),
    sampleRate: Number(audio?.sample_rate ?? 0),
    channels: Number(audio?.channels ?? 0)
  };
}
function validateMeasuredMedia(media, { kind, project, expectedFrames }) {
  if (media.durationInFrames !== expectedFrames || Math.abs(media.fps - project.fps) > 1e-3) throw new Error(`MEDIA_FRAME_CONTRACT_MISMATCH:${media.durationInFrames}:${expectedFrames}`);
  if (kind === "audio") {
    if (media.hasVideo || !media.hasAudio || (media.sampleRate ?? 0) <= 0 || !/wav/u.test(media.format)) throw new Error("AUDIO_PROOF_MEDIA_INVALID");
    return;
  }
  if (!media.hasVideo || !/(?:mp4|mov)/u.test(media.format)) throw new Error("VIDEO_PROOF_MEDIA_INVALID");
  if (media.width !== project.width || media.height !== project.height) throw new Error("VIDEO_DIMENSIONS_MISMATCH");
  if (kind === "visual" && media.hasAudio) throw new Error("VISUAL_PROOF_MUST_BE_MUTED");
  if (kind === "final" && !media.hasAudio) throw new Error("FINAL_AUDIO_STREAM_MISSING");
}
async function extractFrameDigest(filePath, frame, fps, { ffmpeg = "ffmpeg", cwd } = {}) {
  const timestamp = frame / fps;
  const bytes = await run(ffmpeg, ["-v", "error", "-ss", timestamp.toFixed(6), "-i", filePath, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"], { cwd, maxBytes: 32 * 1024 * 1024 });
  if (bytes.byteLength === 0) throw new Error(`FRAME_EXTRACTION_EMPTY:${frame}`);
  return { frame, timestampSeconds: timestamp, sha256: createHash("sha256").update(bytes).digest("hex") };
}
async function measureAudioLoudness(filePath, { ffmpeg = "ffmpeg", cwd } = {}) {
  const { stderr } = await runCaptured(ffmpeg, ["-hide_banner", "-nostats", "-i", filePath, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], { cwd, maxBytes: 8 * 1024 * 1024, timeoutMs: 12e4 });
  const output = stderr.toString("utf8");
  const integrated = [...output.matchAll(/\bI:\s*(-?[0-9]+(?:\.[0-9]+)?)\s+LUFS/gu)].at(-1)?.[1];
  const peak = [...output.matchAll(/\bPeak:\s*(-?[0-9]+(?:\.[0-9]+)?)\s+dBFS/gu)].at(-1)?.[1];
  if (integrated === void 0 || peak === void 0) throw new Error("AUDIO_LOUDNESS_PARSE_FAILED");
  return { integratedLufs: Number(integrated), truePeakDb: Number(peak) };
}
async function compareVideoSimilarity(referencePath, candidatePath, { ffmpeg = "ffmpeg", cwd } = {}) {
  const ssimRun = await runCaptured(ffmpeg, ["-hide_banner", "-nostats", "-i", referencePath, "-i", candidatePath, "-lavfi", "ssim", "-f", "null", "-"], { cwd, maxBytes: 8 * 1024 * 1024, timeoutMs: 15 * 6e4 });
  const ssimMatch = [...ssimRun.stderr.toString("utf8").matchAll(/\bAll:([0-9]+(?:\.[0-9]+)?)/gu)].at(-1)?.[1];
  if (ssimMatch === void 0) throw new Error("VIDEO_SSIM_PARSE_FAILED");
  const psnrRun = await runCaptured(ffmpeg, ["-hide_banner", "-nostats", "-i", referencePath, "-i", candidatePath, "-lavfi", "psnr", "-f", "null", "-"], { cwd, maxBytes: 8 * 1024 * 1024, timeoutMs: 15 * 6e4 });
  const psnrMatch = [...psnrRun.stderr.toString("utf8").matchAll(/\baverage:(inf|[0-9]+(?:\.[0-9]+)?)/gu)].at(-1)?.[1];
  if (psnrMatch === void 0) throw new Error("VIDEO_PSNR_PARSE_FAILED");
  return { ssim: Number(ssimMatch), psnr: psnrMatch === "inf" ? Number.POSITIVE_INFINITY : Number(psnrMatch) };
}
async function renderContactSheet(filePath, frames, outputPath, { ffmpeg = "ffmpeg", cwd } = {}) {
  if (frames.length === 0 || frames.some((frame) => !Number.isInteger(frame) || frame < 0)) throw new Error("CONTACT_SHEET_FRAMES_INVALID");
  const columns = Math.min(4, frames.length);
  const rows = Math.ceil(frames.length / columns);
  const select = frames.map((frame) => `eq(n\\,${frame})`).join("+");
  await runCaptured(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", filePath, "-vf", `select=${select},scale=320:-1,tile=${columns}x${rows}`, "-frames:v", "1", "-y", outputPath], { cwd, maxBytes: 8 * 1024 * 1024, timeoutMs: 12e4 });
}

export {
  mediaToolVersion,
  probeMedia,
  validateMeasuredMedia,
  extractFrameDigest,
  measureAudioLoudness,
  compareVideoSimilarity,
  renderContactSheet
};
