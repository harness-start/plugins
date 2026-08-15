// harness-source-hash: sha256:d28a7dcb6a47adf9d7ab4831024e6c5c282fa6ce764dd9fdb8bb78dd725f42e3

// plugins/video-project-delivery-guard/src/lib/media.ts
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
function run(binary, args, { cwd, maxBytes = 16 * 1024 * 1024, timeoutMs = 3e4 } = {}) {
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
      resolve(Buffer.concat(stdout));
    });
  });
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

export {
  mediaToolVersion,
  probeMedia,
  validateMeasuredMedia,
  extractFrameDigest
};
