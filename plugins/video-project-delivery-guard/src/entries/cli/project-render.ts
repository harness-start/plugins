#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";

import { audioProofPaths, createVideoRenderProof, finalRenderPaths, validateVideoModel, visualProofPaths } from "../../lib/contract.js";
import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { probeMedia, validateMeasuredMedia } from "../../lib/media.js";
import { loadVideoProject } from "../../lib/project.js";
import { assertVideoProjectRoot, atomicWriteJson, sessionMetadata, withWriterJournal } from "../../lib/writer.js";

function runNpm(root, script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "--silent", script, "--", ...args], { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) reject(new Error(`RENDER_SCRIPT_TIMEOUT:${script}`));
      settled = true;
    }, 15 * 60_000);
    child.stderr.on("data", (chunk) => { if (stderr.length < 1024 * 1024) stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); if (!settled) reject(new Error(`RENDER_SCRIPT_UNAVAILABLE:${error.message}`)); settled = true; });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) resolve();
      else reject(new Error(`RENDER_SCRIPT_FAILED:${script}:${stderr.trim()}`));
    });
  });
}

function sourceEntry(model, kind, sourceName) {
  let manifest;
  try { manifest = JSON.parse(model.files[`src/${kind}/manifest.json`]); } catch { return null; }
  return manifest?.units?.find((entry) => entry?.source === sourceName) ?? null;
}

function structuralFindings(model) {
  const ignored = new Set(["AUDIO_PROOF_MISSING", "AUDIO_RENDER_PROOF_INVALID", "VISUAL_PROOF_MISSING", "VISUAL_RENDER_PROOF_INVALID"]);
  return validateVideoModel(model, { stage: "source" }).filter(({ code }) => !ignored.has(code));
}

async function main() {
  const root = assertVideoProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "video-render", argv: processWriterArgv() });
  const kind = process.argv[3];
  const sourceName = process.argv[4] ?? null;
  if (!["visual", "audio", "final"].includes(kind)) throw new Error("RENDER_KIND_INVALID");
  let model = await loadVideoProject(root);
  const findings = structuralFindings(model);
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));

  let sourcePath = null;
  let entry = null;
  let output;
  if (kind === "visual" || kind === "audio") {
    if (!sourceName || basename(sourceName) !== sourceName) throw new Error("RENDER_SOURCE_INVALID");
    entry = sourceEntry(model, kind, sourceName);
    if (!entry) throw new Error("RENDER_SOURCE_NOT_REGISTERED");
    sourcePath = `src/${kind}/${sourceName}`;
    output = kind === "visual" ? visualProofPaths(sourcePath, model.files[sourcePath]) : audioProofPaths(sourcePath, model.files[sourcePath]);
  } else {
    output = finalRenderPaths(model);
    entry = { startFrame: 0, endFrame: model.project.durationInFrames };
  }

  await withWriterJournal(root, "video-render", async () => {
    const temporaryDirectory = join(root, ".tmp", "video-guard");
    const temporaryPath = join(temporaryDirectory, `render-${kind}-${process.pid}-${Date.now()}.${kind === "audio" ? "wav" : "mp4"}`);
    await mkdir(temporaryDirectory, { recursive: true });
    try {
      const script = `video:render:${kind}`;
      const args = ["--output", temporaryPath, "--start-frame", String(entry.startFrame), "--end-frame", String(entry.endFrame), "--fps", String(model.project.fps), "--composition-id", model.project.compositionId];
      if (sourcePath) args.push("--source", sourcePath);
      await runNpm(root, script, args);
      try { const metadata = await stat(temporaryPath); if (!metadata.isFile() || metadata.size === 0) throw new Error("RENDER_OUTPUT_MISSING"); } catch (error) { if (error?.code === "ENOENT") throw new Error("RENDER_OUTPUT_MISSING"); throw error; }
      const media = await probeMedia(temporaryPath, { fps: model.project.fps, cwd: root });
      validateMeasuredMedia(media, { kind, project: model.project, expectedFrames: entry.endFrame - entry.startFrame });
      await mkdir(join(root, output.mediaPath.split("/").slice(0, -1).join("/")), { recursive: true });
      await rename(temporaryPath, join(root, output.mediaPath));
      model = await loadVideoProject(root);
      const proof = { ...createVideoRenderProof(model, { kind, sourcePath, outputPath: output.mediaPath, media, script }), ...sessionMetadata("video-render", grant) };
      await atomicWriteJson(root, output.proofPath, proof);
      process.stdout.write(`${JSON.stringify(proof)}\n`);
    } finally {
      await unlink(temporaryPath).catch(() => {});
    }
  }, grant);
}

main().catch((error) => { process.stderr.write(`[video-project-render] ${error.message}\n`); process.exitCode = 2; });
