#!/usr/bin/env node
// harness-source-hash: sha256:1deb377332db5d9c89b57dce5ad89b6ccfcf0897b36cf63af3c00bbe3bcf6642
import {
  probeMedia,
  validateMeasuredMedia
} from "../chunks/chunk-VEZ34AFA.mjs";
import {
  audioProofPaths,
  consumeWriterCapability,
  createVideoRenderProof,
  finalRenderPaths,
  processWriterArgv,
  validateVideoModel,
  visualProofPaths
} from "../chunks/chunk-SLRENGEQ.mjs";
import {
  assertVideoProjectRoot,
  atomicWriteJson,
  loadVideoProject,
  sessionMetadata,
  withWriterJournal
} from "../chunks/chunk-JEPGOY6Q.mjs";

// plugins/video-project-delivery-guard/src/entries/cli/project-render.ts
import { spawn } from "node:child_process";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
function runNpm(root, script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "--silent", script, "--", ...args], { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) reject(new Error(`RENDER_SCRIPT_TIMEOUT:${script}`));
      settled = true;
    }, 15 * 6e4);
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 1024 * 1024) stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) reject(new Error(`RENDER_SCRIPT_UNAVAILABLE:${error.message}`));
      settled = true;
    });
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
  try {
    manifest = JSON.parse(model.files?.[`src/${kind}/manifest.json`] ?? "");
  } catch {
    return null;
  }
  const units = typeof manifest === "object" && manifest !== null && "units" in manifest && Array.isArray(manifest.units) ? manifest.units : [];
  return units.find((entry) => typeof entry === "object" && entry !== null && "source" in entry && entry.source === sourceName) ?? null;
}
function structuralFindings(model) {
  const ignored = /* @__PURE__ */ new Set(["AUDIO_PROOF_MISSING", "AUDIO_RENDER_PROOF_INVALID", "VISUAL_PROOF_MISSING", "VISUAL_RENDER_PROOF_INVALID"]);
  return validateVideoModel(model, { stage: "source" }).filter(({ code }) => !ignored.has(code));
}
async function main() {
  const root = assertVideoProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "video-render", argv: processWriterArgv() });
  const kind = process.argv[3];
  const sourceName = process.argv[4] ?? null;
  if (kind !== "visual" && kind !== "audio" && kind !== "final") throw new Error("RENDER_KIND_INVALID");
  let model = await loadVideoProject(root);
  const findings = structuralFindings(model);
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  let sourcePath = null;
  let startFrame = 0;
  let endFrame = model.project?.durationInFrames;
  let output;
  if (kind === "visual" || kind === "audio") {
    if (!sourceName || basename(sourceName) !== sourceName) throw new Error("RENDER_SOURCE_INVALID");
    const entry = sourceEntry(model, kind, sourceName);
    if (!entry || typeof entry !== "object") throw new Error("RENDER_SOURCE_NOT_REGISTERED");
    const record = entry;
    startFrame = record.startFrame;
    endFrame = record.endFrame;
    sourcePath = `src/${kind}/${sourceName}`;
    const sourceText = model.files?.[sourcePath];
    output = kind === "visual" ? visualProofPaths(sourcePath, typeof sourceText === "string" ? sourceText : "") : audioProofPaths(sourcePath, typeof sourceText === "string" ? sourceText : "");
  } else {
    output = finalRenderPaths(model);
  }
  const project = model.project ?? {};
  await withWriterJournal(root, "video-render", async () => {
    const temporaryDirectory = join(root, ".tmp", "video-guard");
    const temporaryPath = join(temporaryDirectory, `render-${kind}-${process.pid}-${Date.now()}.${kind === "audio" ? "wav" : "mp4"}`);
    await mkdir(temporaryDirectory, { recursive: true });
    try {
      const script = `video:render:${kind}`;
      const args = ["--output", temporaryPath, "--start-frame", String(startFrame), "--end-frame", String(endFrame), "--fps", String(project.fps), "--composition-id", String(project.compositionId)];
      if (sourcePath) args.push("--source", sourcePath);
      await runNpm(root, script, args);
      try {
        const metadata = await stat(temporaryPath);
        if (!metadata.isFile() || metadata.size === 0) throw new Error("RENDER_OUTPUT_MISSING");
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
        if (code === "ENOENT") throw new Error("RENDER_OUTPUT_MISSING");
        throw error;
      }
      const media = await probeMedia(temporaryPath, { fps: project.fps, cwd: root });
      validateMeasuredMedia(media, {
        kind,
        project: { fps: project.fps ?? Number.NaN, width: project.width ?? Number.NaN, height: project.height ?? Number.NaN },
        expectedFrames: Number(endFrame) - Number(startFrame)
      });
      await mkdir(join(root, output.mediaPath.split("/").slice(0, -1).join("/")), { recursive: true });
      await rename(temporaryPath, join(root, output.mediaPath));
      model = await loadVideoProject(root);
      const proof = { ...createVideoRenderProof(model, { kind, sourcePath, outputPath: output.mediaPath, media, script }), ...sessionMetadata("video-render", grant) };
      await atomicWriteJson(root, output.proofPath, proof);
      process.stdout.write(`${JSON.stringify(proof)}
`);
    } finally {
      await unlink(temporaryPath).catch(() => {
      });
    }
  }, grant);
}
main().catch((error) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[video-project-render] ${message}
`);
  process.exitCode = 2;
});
