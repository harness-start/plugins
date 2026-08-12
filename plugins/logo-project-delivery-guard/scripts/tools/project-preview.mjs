#!/usr/bin/env node
/**
 * Generate multi-size + black/reverse preview strip and REAL squint evidence.
 * Builds the strip inside the plugin and analyzes its rendered pixels.
 *
 * Usage: node project-preview.mjs <project-root> [--write-review]
 * Does NOT auto-stamp aesthetic scores.
 */
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { masterSubjectDigest } from "../lib/contract.mjs";
import { decodePngToRgba } from "../lib/png-decode.mjs";
import { renderPreviewStrip } from "../lib/preview-strip.mjs";
import { buildSquintEvidence } from "../lib/squint.mjs";

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
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
  const rootArg = args[0];
  const options = args.slice(1);
  const root = resolve(rootArg?.startsWith("-") ? "" : (rootArg ?? ""));
  const writeReview = args.includes("--write-review");
  if (!rootArg || rootArg.startsWith("-") || options.some((option) => option !== "--write-review") || options.filter((option) => option === "--write-review").length > 1) {
    process.stderr.write("usage: project-preview.mjs <project-root> [--write-review]\n");
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

  const geometry = await renderPreviewStrip({
    svgSource: await readFile(markSvg, "utf8"),
    outputPath: stripPath,
  });

  const stripBytes = await readFile(stripPath);
  const stripDigest = createHash("sha256").update(stripBytes).digest("hex");
  const manifest = {
    schemaVersion: 1,
    masterDigest: digest,
    artifact: {
      path: relativeToRoot(root, stripPath),
      kind: "image/png",
      sha256: stripDigest,
      bytes: stripBytes.byteLength,
      width: geometry.width,
      height: geometry.height,
    },
    samples: geometry.samples,
  };
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
