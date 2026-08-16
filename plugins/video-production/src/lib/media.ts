import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

import type { VideoMeasuredMedia } from "./contract.js";

type RunOptions = {
  cwd?: string | undefined;
  maxBytes?: number | undefined;
  timeoutMs?: number | undefined;
};

function runCaptured(binary: string, args: readonly string[], { cwd, maxBytes = 16 * 1024 * 1024, timeoutMs = 30_000 }: RunOptions = {}): Promise<{ stdout: Buffer; stderr: Buffer }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
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
      resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    });
  });
}

async function run(binary: string, args: readonly string[], options: RunOptions = {}): Promise<Buffer> {
  return (await runCaptured(binary, args, options)).stdout;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ratio(value: unknown) {
  const parts = String(value ?? "").split("/").map(Number);
  const numerator = parts[0] ?? Number.NaN;
  const denominator = parts[1] ?? Number("1");
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator;
}

export async function mediaToolVersion(binary = "ffprobe") {
  const output = await run(binary, ["-version"], { maxBytes: 1024 * 1024 });
  return (output.toString("utf8").split(/\r?\n/u)[0] ?? "").trim();
}

export async function probeMedia(filePath: string, { fps, ffprobe = "ffprobe", cwd }: {
  fps?: number | undefined;
  ffprobe?: string | undefined;
  cwd?: string | undefined;
} = {}): Promise<VideoMeasuredMedia> {
  const output = await run(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath], { cwd });
  let payload: unknown;
  try { payload = JSON.parse(output.toString("utf8")) as unknown; } catch { throw new Error("FFPROBE_JSON_INVALID"); }
  const payloadRecord = isRecord(payload) ? payload : {};
  const streams = Array.isArray(payloadRecord.streams) ? payloadRecord.streams.filter(isRecord) : [];
  const video = streams.find((stream) => stream.codec_type === "video") ?? null;
  const audio = streams.find((stream) => stream.codec_type === "audio") ?? null;
  const measuredFps = video ? ratio(video.avg_frame_rate || video.r_frame_rate) : Number(fps);
  const formatRecord = isRecord(payloadRecord.format) ? payloadRecord.format : undefined;
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
    channels: Number(audio?.channels ?? 0),
  };
}

export function validateMeasuredMedia(media: VideoMeasuredMedia, { kind, project, expectedFrames }: {
  kind: string;
  project: { fps: number; width: number; height: number };
  expectedFrames: number;
}) {
  if (media.durationInFrames !== expectedFrames || Math.abs(media.fps - project.fps) > 0.001) throw new Error(`MEDIA_FRAME_CONTRACT_MISMATCH:${media.durationInFrames}:${expectedFrames}`);
  if (kind === "audio") {
    if (media.hasVideo || !media.hasAudio || (media.sampleRate ?? 0) <= 0 || !/wav/u.test(media.format)) throw new Error("AUDIO_PROOF_MEDIA_INVALID");
    return;
  }
  if (!media.hasVideo || !/(?:mp4|mov)/u.test(media.format)) throw new Error("VIDEO_PROOF_MEDIA_INVALID");
  if (media.width !== project.width || media.height !== project.height) throw new Error("VIDEO_DIMENSIONS_MISMATCH");
  if (kind === "visual" && media.hasAudio) throw new Error("VISUAL_PROOF_MUST_BE_MUTED");
  if (kind === "final" && !media.hasAudio) throw new Error("FINAL_AUDIO_STREAM_MISSING");
}

export async function extractFrameDigest(filePath: string, frame: number, fps: number, { ffmpeg = "ffmpeg", cwd }: {
  ffmpeg?: string | undefined;
  cwd?: string | undefined;
} = {}) {
  const timestamp = frame / fps;
  const bytes = await run(ffmpeg, ["-v", "error", "-ss", timestamp.toFixed(6), "-i", filePath, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"], { cwd, maxBytes: 32 * 1024 * 1024 });
  if (bytes.byteLength === 0) throw new Error(`FRAME_EXTRACTION_EMPTY:${frame}`);
  return { frame, timestampSeconds: timestamp, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function measureAudioLoudness(filePath: string, { ffmpeg = "ffmpeg", cwd }: {
  ffmpeg?: string | undefined;
  cwd?: string | undefined;
} = {}) {
  const { stderr } = await runCaptured(ffmpeg, ["-hide_banner", "-nostats", "-i", filePath, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], { cwd, maxBytes: 8 * 1024 * 1024, timeoutMs: 120_000 });
  const output = stderr.toString("utf8");
  const integrated = [...output.matchAll(/\bI:\s*(-?[0-9]+(?:\.[0-9]+)?)\s+LUFS/gu)].at(-1)?.[1];
  const peak = [...output.matchAll(/\bPeak:\s*(-?[0-9]+(?:\.[0-9]+)?)\s+dBFS/gu)].at(-1)?.[1];
  if (integrated === undefined || peak === undefined) throw new Error("AUDIO_LOUDNESS_PARSE_FAILED");
  return { integratedLufs: Number(integrated), truePeakDb: Number(peak) };
}

export async function compareVideoSimilarity(referencePath: string, candidatePath: string, { ffmpeg = "ffmpeg", cwd }: {
  ffmpeg?: string | undefined;
  cwd?: string | undefined;
} = {}) {
  const ssimRun = await runCaptured(ffmpeg, ["-hide_banner", "-nostats", "-i", referencePath, "-i", candidatePath, "-lavfi", "ssim", "-f", "null", "-"], { cwd, maxBytes: 8 * 1024 * 1024, timeoutMs: 15 * 60_000 });
  const ssimMatch = [...ssimRun.stderr.toString("utf8").matchAll(/\bAll:([0-9]+(?:\.[0-9]+)?)/gu)].at(-1)?.[1];
  if (ssimMatch === undefined) throw new Error("VIDEO_SSIM_PARSE_FAILED");
  const psnrRun = await runCaptured(ffmpeg, ["-hide_banner", "-nostats", "-i", referencePath, "-i", candidatePath, "-lavfi", "psnr", "-f", "null", "-"], { cwd, maxBytes: 8 * 1024 * 1024, timeoutMs: 15 * 60_000 });
  const psnrMatch = [...psnrRun.stderr.toString("utf8").matchAll(/\baverage:(inf|[0-9]+(?:\.[0-9]+)?)/gu)].at(-1)?.[1];
  if (psnrMatch === undefined) throw new Error("VIDEO_PSNR_PARSE_FAILED");
  return { ssim: Number(ssimMatch), psnr: psnrMatch === "inf" ? Number.POSITIVE_INFINITY : Number(psnrMatch) };
}

export async function renderContactSheet(filePath: string, frames: readonly number[], outputPath: string, { ffmpeg = "ffmpeg", cwd }: {
  ffmpeg?: string | undefined;
  cwd?: string | undefined;
} = {}) {
  if (frames.length === 0 || frames.some((frame) => !Number.isInteger(frame) || frame < 0)) throw new Error("CONTACT_SHEET_FRAMES_INVALID");
  const columns = Math.min(4, frames.length);
  const rows = Math.ceil(frames.length / columns);
  const select = frames.map((frame) => `eq(n\\,${frame})`).join("+");
  await runCaptured(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", filePath, "-vf", `select=${select},scale=320:-1,tile=${columns}x${rows}`, "-frames:v", "1", "-y", outputPath], { cwd, maxBytes: 8 * 1024 * 1024, timeoutMs: 120_000 });
}
