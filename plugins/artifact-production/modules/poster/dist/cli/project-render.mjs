#!/usr/bin/env node
// harness-source-hash: sha256:bd265d620bc663ff6d6a2491495b1edfb0f5c489283b9c5be063e2cc15436c81
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-CEMEKR75.mjs";
import {
  RENDER_EVIDENCE_SCHEMA,
  assertPosterProjectRoot,
  atomicWriteJson,
  computePosterSubjectDigest,
  inspectPosterPng,
  inspectPosterSvg,
  loadPosterProject,
  sessionMetadata,
  validatePosterModel,
  withWriterJournal
} from "../chunks/chunk-4BH6ZEKT.mjs";

// plugins/artifact-production/modules/poster/src/entries/cli/project-render.ts
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
function runProjectRenderer(root, output) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "--silent", "poster:render", "--", "--output-dir", output], { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 18e4);
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 1024 * 1024) stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`RENDER_SCRIPT_UNAVAILABLE:${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`RENDER_SCRIPT_FAILED:${stderr.trim()}`));
    });
  });
}
async function main() {
  const root = assertPosterProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "poster-render", argv: processWriterArgv() });
  let model = await loadPosterProject(root);
  if (grant.subjectDigest !== computePosterSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const sourceFindings = validatePosterModel(model, { stage: "source" });
  if (sourceFindings.length) throw new Error(sourceFindings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const manifest = JSON.parse(String(model.files?.["src/variants/manifest.json"]));
  const require2 = createRequire(join(root, "package.json"));
  const { Resvg } = require2("@resvg/resvg-js");
  await withWriterJournal(root, "poster-render", async () => {
    const temp = join(root, ".tmp", "poster-guard", `render-${process.pid}-${Date.now()}`);
    await mkdir(temp, { recursive: true });
    try {
      await runProjectRenderer(root, temp);
      await rm(join(root, "dist"), { recursive: true, force: true });
      await rm(join(root, "evidence", "layers"), { recursive: true, force: true });
      for (const path of ["evidence.render.json", "evidence.probe.json", "evidence.accessibility.json", "evidence.composition.json", "review.poster.json", "release.manifest.json", "receipt.release.json"]) await rm(join(root, path), { force: true });
      await mkdir(join(root, "dist"), { recursive: true });
      await mkdir(join(root, "evidence", "layers"), { recursive: true });
      for (const variant of manifest.variants) {
        const candidateSvg = join(temp, "final", `${variant.id}.svg`);
        if (!(await stat(candidateSvg)).isFile()) throw new Error(`RENDER_OUTPUT_MISSING:${variant.id}`);
        const svg = await readFile(candidateSvg);
        const inspection = inspectPosterSvg(svg);
        if (inspection.width !== variant.width || inspection.height !== variant.height) throw new Error(`RENDER_DIMENSION_MISMATCH:${variant.id}`);
        const png = new Resvg(svg).render().asPng();
        const pngInspection = inspectPosterPng(png);
        if (pngInspection.width !== variant.width || pngInspection.height !== variant.height || pngInspection.alphaCoverage < 0.01) throw new Error(`RENDER_PNG_INVALID:${variant.id}`);
        await rename(candidateSvg, join(root, "dist", `${model.artifactId}.${variant.id}.svg`));
        await writeFile(join(root, "dist", `${model.artifactId}.${variant.id}.png`), png, { flag: "wx" });
        const layers = JSON.parse(String(model.files?.[`src/variants/${variant.directory}/layers/manifest.json`]));
        const layerTarget = join(root, "evidence", "layers", variant.id);
        await mkdir(layerTarget, { recursive: true });
        for (const layer of layers.layers) {
          const stem = basename(layer.source, ".tsx");
          const sourcePath = `src/variants/${variant.directory}/layers/${layer.source}`;
          const sourceDigest = model.digests?.[sourcePath];
          if (!sourceDigest) throw new Error(`LAYER_SOURCE_DIGEST_MISSING:${sourcePath}`);
          const layerSvgPath = join(temp, "layers", variant.id, `${stem}.svg`);
          const layerSvg = await readFile(layerSvgPath);
          const layerInspection = inspectPosterSvg(layerSvg);
          if (layerInspection.width !== variant.width || layerInspection.height !== variant.height) throw new Error(`LAYER_DIMENSION_MISMATCH:${sourcePath}`);
          const layerPng = new Resvg(layerSvg).render().asPng();
          inspectPosterPng(layerPng);
          await rename(layerSvgPath, join(layerTarget, `${stem}.${sourceDigest}.svg`));
          await writeFile(join(layerTarget, `${stem}.${sourceDigest}.png`), layerPng, { flag: "wx" });
        }
      }
      model = await loadPosterProject(root);
      const outputs = Object.keys(model.files ?? {}).filter((path) => /^dist\/.+\.(?:svg|png)$|^evidence\/layers\/.+\.(?:svg|png)$/u.test(path)).sort().map((path) => ({ path, sha256: model.digests?.[path] }));
      await atomicWriteJson(root, "evidence.render.json", { schema: RENDER_EVIDENCE_SCHEMA, plugin: "poster-production", artifactId: model.artifactId, subjectDigest: computePosterSubjectDigest(model), verdict: "pass", renderer: { satori: "0.29.0", resvg: "2.6.2" }, outputs, ...sessionMetadata("poster-render", grant) });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, grant);
  process.stdout.write(`${JSON.stringify({ artifactId: model.artifactId, variants: manifest.variants.length })}
`);
}
main().catch((error) => {
  process.stderr.write(`[poster-project-render] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
