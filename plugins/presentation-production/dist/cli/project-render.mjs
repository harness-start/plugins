#!/usr/bin/env node
// harness-source-hash: sha256:7dbd753bc157e61becaf4e4c98315b72361e6f0aafc7465003f54905a0acfd46
import {
  pdfPageCount,
  renderOfficePages,
  toolVersion
} from "../chunks/chunk-THMNOHHQ.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-DWPSMNZX.mjs";
import {
  assertPptxProjectRoot,
  atomicWriteJson,
  sessionMetadata,
  withWriterJournal
} from "../chunks/chunk-AZMNGOZB.mjs";
import {
  RENDER_EVIDENCE_SCHEMA,
  computePptxSubjectDigest,
  inspectPptxPackage,
  loadPptxProject,
  validatePptxModel
} from "../chunks/chunk-SY4XKZY6.mjs";

// plugins/presentation-production/src/entries/cli/project-render.ts
import { spawn } from "node:child_process";
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
function runProjectRenderer(root, output) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "--silent", "pptx:render", "--", "--output", output], { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
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
  const root = assertPptxProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "pptx-render", argv: processWriterArgv() });
  let model = await loadPptxProject(root);
  if (grant.subjectDigest !== computePptxSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const findings = validatePptxModel(model, { stage: "source" });
  if (findings.length) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const manifest = JSON.parse(String(model.files?.["src/slides/manifest.json"]));
  const storyboard = JSON.parse(String(model.files?.["plan.storyboard.json"]));
  await withWriterJournal(root, "pptx-render", async () => {
    const temp = join(root, ".tmp", "pptx-guard", `render-${process.pid}-${Date.now()}`);
    await mkdir(temp, { recursive: true });
    const candidate = join(temp, `${model.artifactId}.pptx`);
    try {
      await runProjectRenderer(root, candidate);
      if (!(await stat(candidate)).isFile()) throw new Error("RENDER_OUTPUT_MISSING");
      const candidateBytes = await import("node:fs/promises").then(({ readFile }) => readFile(candidate));
      const inspection = inspectPptxPackage(candidateBytes);
      if (inspection.slideCount !== manifest.slides.length || inspection.unresolvedRelationships.length) throw new Error("RENDER_PPTX_STRUCTURE_INVALID");
      const diagramDigests = storyboard.slides.filter(({ visualType }) => visualType === "diagram").map(({ diagram }) => diagram?.sha256).filter((value) => typeof value === "string");
      if (diagramDigests.length && (inspection.externalRelationships.length || diagramDigests.some((expected) => !inspection.media.some(({ sha256 }) => sha256 === expected)))) throw new Error("RENDER_DIAGRAM_MEDIA_MISMATCH");
      const rendered = await renderOfficePages(candidate, temp, { cwd: root });
      const pageCount = await pdfPageCount(rendered.pdfPath, { cwd: root });
      if (pageCount !== manifest.slides.length || rendered.pages.length !== manifest.slides.length) throw new Error("RENDER_PAGE_COUNT_MISMATCH");
      const distPages = join(root, "dist", "pages");
      await rm(join(root, "dist"), { recursive: true, force: true });
      await mkdir(distPages, { recursive: true });
      await rename(candidate, join(root, "dist", `${model.artifactId}.pptx`));
      await rename(rendered.pdfPath, join(root, "dist", `${model.artifactId}.pdf`));
      for (const [index, page] of rendered.pages.entries()) {
        const target = join(distPages, `${String(index + 1).padStart(3, "0")}.png`);
        await rename(join(temp, page.sourceName), target);
        const slide = manifest.slides[index];
        if (!slide) throw new Error("RENDER_MANIFEST_CHANGED");
        const sourcePath = `src/slides/${slide.source}`;
        await copyFile(target, join(root, `${sourcePath.slice(0, -3)}.${model.digests?.[sourcePath]}.png`));
      }
      model = await loadPptxProject(root);
      await atomicWriteJson(root, "evidence.render.json", {
        schema: RENDER_EVIDENCE_SCHEMA,
        plugin: "presentation-production",
        artifactId: model.artifactId,
        subjectDigest: computePptxSubjectDigest(model),
        output: { pptxSha256: model.digests?.[`dist/${model.artifactId}.pptx`], pdfSha256: model.digests?.[`dist/${model.artifactId}.pdf`], pages: rendered.pages.map((page, index) => ({ index: index + 1, path: `dist/pages/${String(index + 1).padStart(3, "0")}.png`, sha256: model.digests?.[`dist/pages/${String(index + 1).padStart(3, "0")}.png`] })) },
        pageCount,
        tools: { soffice: await toolVersion("soffice"), pdftoppm: await toolVersion("pdftoppm", ["-v"]).catch(() => "pdftoppm") },
        ...sessionMetadata("pptx-render", grant)
      });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, grant);
  process.stdout.write(`${JSON.stringify({ artifactId: model.artifactId, pages: manifest.slides.length })}
`);
}
main().catch((error) => {
  process.stderr.write(`[pptx-project-render] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
