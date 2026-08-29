#!/usr/bin/env node
/**
 * Generate multi-size + black/reverse preview strip and REAL squint evidence.
 * Builds the strip inside the plugin and analyzes its rendered pixels.
 *
 * Usage: node project-preview.mjs <project-root>
 * Does NOT auto-stamp aesthetic scores.
 */
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { computeLogoSubjectDigest, masterSubjectDigest, type DigestMap, type FileMap } from "../../lib/contract.js";
import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { decodePngToRgba } from "../../lib/png-decode.js";
import { renderPreviewStrip } from "../../lib/preview-strip.js";
import { assertLogoProjectRoot } from "../../lib/project.js";
import { buildSquintEvidence } from "../../lib/squint.js";
import { withWriterJournal } from "../../lib/writer.js";

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function loadTextTree(root: string): Promise<{ files: FileMap; digests: DigestMap }> {
  const { readdir } = await import("node:fs/promises");
  const files: FileMap = {};
  const digests: DigestMap = {};
  async function walk(dir: string): Promise<void> {
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
  const root = resolve(rootArg?.startsWith("-") ? "" : (rootArg ?? ""));
  if (!rootArg || rootArg.startsWith("-") || args.length !== 1) {
    process.stderr.write("usage: project-preview.mjs <project-root>\n");
    process.exitCode = 2;
    return;
  }

  await assertLogoProjectRoot(root);
  const grant = await consumeWriterCapability({ root, capability: "logo-preview", argv: processWriterArgv() });
  const markSvg = join(root, "build/master/mark.svg");
  if (!(await exists(markSvg))) throw new Error("build/master/mark.svg is required");

  const tree = await loadTextTree(root);
  const model = { files: tree.files, digests: tree.digests, artifactId: basename(root) };
  if (grant.subjectDigest !== computeLogoSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const digest = masterSubjectDigest(model);
  const result = await withWriterJournal(root, "logo-preview", grant, async () => {
    const previewDir = join(root, "evidence/preview");
    await mkdir(previewDir, { recursive: true });
    const stripPath = join(previewDir, `strip.${digest}.png`);
    const manifestPath = join(previewDir, `strip.${digest}.manifest.json`);
    const squintPath = join(previewDir, `squint.${digest}.json`);
    const geometry = await renderPreviewStrip({ svgSource: await readFile(markSvg, "utf8"), outputPath: stripPath });
    const stripBytes = await readFile(stripPath);
    const stripDigest = createHash("sha256").update(stripBytes).digest("hex");
    const manifest = { schemaVersion: 1, masterDigest: digest, artifact: { path: relativeToRoot(root, stripPath), kind: "image/png", sha256: stripDigest, bytes: stripBytes.byteLength, width: geometry.width, height: geometry.height }, samples: geometry.samples };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const { width, height, rgba } = decodePngToRgba(stripBytes);
    const squint = buildSquintEvidence({ rgba, width, height, samples: manifest.samples, masterDigest: digest, stripDigest });
    await writeFile(squintPath, `${JSON.stringify(squint, null, 2)}\n`);
    return { squint, stripPath, manifestPath, squintPath, stripDigest, sampleCount: manifest.samples.length };
  });

  if (!result.squint.pass) {
    process.stderr.write(`[logo-project-preview] squint FAILED — see ${result.squintPath}\n`);
    process.exitCode = 3;
  }

  process.stdout.write(`${JSON.stringify({
    ok: result.squint.pass,
    masterDigest: digest,
    stripPath: relativeToRoot(root, result.stripPath),
    manifestPath: relativeToRoot(root, result.manifestPath),
    squintPath: relativeToRoot(root, result.squintPath),
    stripDigest: result.stripDigest,
    squintPass: result.squint.pass,
    sampleCount: result.sampleCount,
  }, null, 2)}\n`);
}

function relativeToRoot(root: string, abs: string): string {
  return abs.slice(root.length + 1).replaceAll("\\", "/");
}

await main().catch((error: unknown) => {
  process.stderr.write(`[logo-project-preview] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
