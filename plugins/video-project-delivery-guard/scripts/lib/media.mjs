import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

function run(binary, args, { cwd, maxBytes = 16 * 1024 * 1024, timeoutMs = 30_000 } = {}) {
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
      if (stdoutBytes > maxBytes) { reject(new Error(`MEDIA_TOOL_OUTPUT_LIMIT:${binary}`)); return; }
      if (code !== 0) { reject(new Error(`MEDIA_TOOL_FAILED:${binary}:${Buffer.concat(stderr).toString("utf8").trim()}`)); return; }
      resolve(Buffer.concat(stdout));
    });
  });
}

function ratio(value) {
  const [numerator, denominator = "1"] = String(value ?? "").split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator;
}

export async function mediaToolVersion(binary = "ffprobe") {
  const output = await run(binary, ["-version"], { maxBytes: 1024 * 1024 });
  return output.toString("utf8").split(/\r?\n/u)[0].trim();
}

export async function probeMedia(filePath, { fps, ffprobe = "ffprobe", cwd } = {}) {
  const output = await run(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath], { cwd });
  let payload;
  try { payload = JSON.parse(output.toString("utf8")); } catch { throw new Error("FFPROBE_JSON_INVALID"); }
  const streams = Array.isArray(payload?.streams) ? payload.streams : [];
  const video = streams.find((stream) => stream?.codec_type === "video") ?? null;
  const audio = streams.find((stream) => stream?.codec_type === "audio") ?? null;
  const measuredFps = video ? ratio(video.avg_frame_rate || video.r_frame_rate) : Number(fps);
  const durationSeconds = Number(payload?.format?.duration ?? video?.duration ?? audio?.duration);
  const durationInFrames = Number.isFinite(durationSeconds) && Number.isFinite(measuredFps) ? Math.round(durationSeconds * measuredFps) : Number(video?.nb_frames);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isInteger(durationInFrames) || durationInFrames <= 0) throw new Error("MEDIA_DURATION_INVALID");
  return {
    format: String(payload?.format?.format_name ?? ""),
    durationSeconds,
    durationInFrames,
    fps: measuredFps,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    width: Number(video?.width ?? 0),
    height: Number(video?.height ?? 0),
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    sampleRate: Number(audio?.sample_rate ?? 0),
    channels: Number(audio?.channels ?? 0),
  };
}

export function validateMeasuredMedia(media, { kind, project, expectedFrames }) {
  if (media.durationInFrames !== expectedFrames || Math.abs(media.fps - project.fps) > 0.001) throw new Error(`MEDIA_FRAME_CONTRACT_MISMATCH:${media.durationInFrames}:${expectedFrames}`);
  if (kind === "audio") {
    if (media.hasVideo || !media.hasAudio || media.sampleRate <= 0 || !/wav/u.test(media.format)) throw new Error("AUDIO_PROOF_MEDIA_INVALID");
    return;
  }
  if (!media.hasVideo || !/(?:mp4|mov)/u.test(media.format)) throw new Error("VIDEO_PROOF_MEDIA_INVALID");
  if (media.width !== project.width || media.height !== project.height) throw new Error("VIDEO_DIMENSIONS_MISMATCH");
  if (kind === "visual" && media.hasAudio) throw new Error("VISUAL_PROOF_MUST_BE_MUTED");
  if (kind === "final" && !media.hasAudio) throw new Error("FINAL_AUDIO_STREAM_MISSING");
}

export async function extractFrameDigest(filePath, frame, fps, { ffmpeg = "ffmpeg", cwd } = {}) {
  const timestamp = frame / fps;
  const bytes = await run(ffmpeg, ["-v", "error", "-ss", timestamp.toFixed(6), "-i", filePath, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"], { cwd, maxBytes: 32 * 1024 * 1024 });
  if (bytes.byteLength === 0) throw new Error(`FRAME_EXTRACTION_EMPTY:${frame}`);
  return { frame, timestampSeconds: timestamp, sha256: createHash("sha256").update(bytes).digest("hex") };
}
