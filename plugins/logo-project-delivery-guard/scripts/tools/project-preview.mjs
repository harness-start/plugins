#!/usr/bin/env node
/**
 * Generate multi-size + black/reverse preview strip and REAL squint evidence.
 * Uses host logo-design skill logo-preview-strip; analyzes strip pixels.
 *
 * Usage: node project-preview.mjs <project-root> [--strip-tool <path>] [--write-review]
 * Does NOT auto-stamp aesthetic scores unless --write-review is passed with explicit env.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";

import { masterSubjectDigest } from "../lib/contract.mjs";
import { decodePngToRgba } from "../lib/png-decode.mjs";
import { buildSquintEvidence } from "../lib/squint.mjs";

const sha256File = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function resolveStripTool(explicit) {
  if (explicit) return explicit;
  const candidates = [
    process.env.LOGO_PREVIEW_STRIP_TOOL,
    join(homedir(), ".agents/skills/logo-design/scripts/logo-preview-strip.mjs"),
    "/srv/workspaces/.agents/skills/logo-design/scripts/logo-preview-strip.mjs",
  ].filter(Boolean);
  return candidates[0];
}

async function loadTextTree(root) {
  const { readdir } = await import("node:fs/promises");
  const files = {};
  const digests = {};
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else if (entry.isFile()) {
        const rel = abs.slice(root.length + 1).replaceAll("\\", "/");
        const bytes = await readFile(abs);
        digests[rel] = createHash("sha256").update(bytes).digest("hex");
        files[rel] = /\.(png|jpg|jpeg|webp)$/iu.test(rel) ? bytes.toString("base64") : bytes.toString("utf8");
      }
    }
  }
  await walk(root);
  return { files, digests };
}

async function main() {
  const args = process.argv.slice(2);
  const root = resolve(args.find((a) => !a.startsWith("--")) ?? "");
  const toolFlag = args.indexOf("--strip-tool");
  const stripTool = resolveStripTool(toolFlag >= 0 ? args[toolFlag + 1] : null);
  const writeReview = args.includes("--write-review");
  if (!root) {
    process.stderr.write("usage: project-preview.mjs <project-root> [--strip-tool path] [--write-review]\n");
    process.exitCode = 2;
    return;
  }

  const markSvg = join(root, "build/master/mark.svg");
  if (!(await exists(markSvg))) throw new Error("build/master/mark.svg is required");

  const tree = await loadTextTree(root);
  const model = { files: tree.files, digests: tree.digests, artifactId: basename(root) };
  const digest = masterSubjectDigest(model);

  const previewDir = join(root, "evidence/preview");
  await mkdir(previewDir, { recursive: true });
  const stripPath = join(previewDir, `strip.${digest}.png`);
  const manifestPath = join(previewDir, `strip.${digest}.manifest.json`);
  const squintPath = join(previewDir, `squint.${digest}.json`);

  if (!(await exists(stripTool))) {
    throw new Error(`logo-preview-strip tool not found (set LOGO_PREVIEW_STRIP_TOOL). looked for: ${stripTool}`);
  }

  const env = {
    ...process.env,
    AI_EXPERTS_SESSION_ID: process.env.AI_EXPERTS_SESSION_ID ?? process.env.CODEX_THREAD_ID ?? "logo-preview",
    AI_EXPERTS_TRIGGER_FROM: process.env.AI_EXPERTS_TRIGGER_FROM ?? "logo-project-delivery-guard:project-preview",
  };
  const result = spawnSync(process.execPath, [
    stripTool,
    markSvg,
    stripPath,
    "--sizes", "16,32,64",
    "--manifest", manifestPath,
    "--overwrite",
  ], { env, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`logo-preview-strip failed with exit ${result.status}`);
  }

  const stripBytes = await readFile(stripPath);
  const stripDigest = createHash("sha256").update(stripBytes).digest("hex");
  let manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  // Preserve logo-preview-strip samples/bboxes; only annotate master binding.
  manifest.masterDigest = digest;
  if (manifest.artifact && typeof manifest.artifact === "object") {
    manifest.artifact.sha256 = stripDigest;
  } else {
    manifest.artifact = { sha256: stripDigest, kind: "image/png" };
  }
  if (!Array.isArray(manifest.samples) || manifest.samples.length === 0) {
    throw new Error("logo-preview-strip manifest missing samples[] with locator.bbox");
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const { width, height, rgba } = decodePngToRgba(stripBytes);
  const squint = buildSquintEvidence({
    rgba,
    width,
    height,
    samples: manifest.samples,
    masterDigest: digest,
    stripDigest,
  });
  await writeFile(squintPath, `${JSON.stringify(squint, null, 2)}\n`);

  if (writeReview) {
    // Only bind digests; never invent passing aesthetic scores.
    const reviewPath = join(root, "review.logo.json");
    let review = {};
    if (await exists(reviewPath)) {
      try { review = JSON.parse(await readFile(reviewPath, "utf8")); } catch { review = {}; }
    }
    review.masterDigest = digest;
    review.squintStripDigest = stripDigest;
    review.squintPass = squint.pass;
    if (review.autoStamped) delete review.autoStamped;
    if (review.source === "project-preview-default") delete review.source;
    await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
  }

  if (!squint.pass) {
    process.stderr.write(`[logo-project-preview] squint FAILED — see ${squintPath}\n`);
    process.exitCode = 3;
  }

  process.stdout.write(`${JSON.stringify({
    ok: squint.pass,
    masterDigest: digest,
    stripPath: relativeToRoot(root, stripPath),
    manifestPath: relativeToRoot(root, manifestPath),
    squintPath: relativeToRoot(root, squintPath),
    stripDigest,
    squintPass: squint.pass,
    sampleCount: manifest.samples.length,
  }, null, 2)}\n`);
}

function relativeToRoot(root, abs) {
  return abs.slice(root.length + 1).replaceAll("\\", "/");
}

main().catch((error) => {
  process.stderr.write(`[logo-project-preview] ${error.message}\n`);
  process.exitCode = 2;
});
