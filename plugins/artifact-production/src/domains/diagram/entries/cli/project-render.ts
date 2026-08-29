#!/usr/bin/env node

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { RENDER_EVIDENCE_SCHEMA, computeDiagramSubjectDigest, loadDiagramProject, validateDiagramModel } from "../../lib/contract.js";
import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { renderDiagram } from "../../lib/render.js";
import { assertDiagramProjectRoot, atomicWrite, atomicWriteJson, sessionMetadata, withWriterJournal } from "../../lib/writer.js";

async function embeddedFontCss(require: NodeJS.Require) {
  const rules: string[] = [];
  for (const [family, packageName] of [["Noto Sans SC", "@fontsource/noto-sans-sc"], ["Noto Serif SC", "@fontsource/noto-serif-sc"]] as const) {
    const cssPath = require.resolve(`${packageName}/chinese-simplified-400.css`); const css = await readFile(cssPath, "utf8"); const reference = css.match(/url\((?:\.\/)?([^)'"]+\.woff2)\)/u)?.[1];
    if (!reference) throw new Error(`FONT_FILE_MISSING:${packageName}`);
    const bytes = await readFile(join(dirname(cssPath), reference)); rules.push(`@font-face{font-family:'${family}';font-style:normal;font-weight:400;src:url(data:font/woff2;base64,${bytes.toString("base64")}) format('woff2')}`);
  }
  return rules.join("");
}

async function main() {
  const root = assertDiagramProjectRoot(process.argv[2]); let model = await loadDiagramProject(root); const grant = await consumeWriterCapability({ root, capability: "diagram-render", argv: processWriterArgv() });
  if (grant.subjectDigest !== computeDiagramSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED"); const findings = validateDiagramModel(model, { stage: "source" }); if (findings.length) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const require = createRequire(join(root, "package.json")); const { Resvg } = require("@resvg/resvg-js") as { Resvg: new (svg: string) => { render(): { asPng(): Buffer } } };
  const Elk = require("elkjs/lib/elk.bundled.js") as new () => { layout(graph: Record<string, unknown>): Promise<Record<string, unknown>> };
  const source = JSON.parse(String(model.files?.["src/diagram.json"])); const design = JSON.parse(String(model.files?.["design.system.json"])); const result = await renderDiagram(source, design, { embeddedFontCss: await embeddedFontCss(require), elk: new Elk() }); const png = new Resvg(result.svg).render().asPng(); const artifactId = model.artifactId ?? "diagram";
  await withWriterJournal(root, "diagram-render", async () => {
    await atomicWrite(root, `dist/${artifactId}.svg`, result.svg); await atomicWrite(root, `dist/${artifactId}.png`, png); await atomicWrite(root, `dist/${artifactId}.html`, result.html);
    const project = model.project as { outputs?: string[] }; if (project.outputs?.includes("drawio")) await atomicWrite(root, `dist/${artifactId}.drawio`, result.drawio);
    model = await loadDiagramProject(root); await atomicWriteJson(root, "evidence.render.json", { schema: RENDER_EVIDENCE_SCHEMA, plugin: "diagram-production", artifactId, subjectDigest: computeDiagramSubjectDigest(model), verdict: "pass", renderer: { scene: "diagram-production/scene/v1", layout: "elkjs@0.12.0-compatible", raster: "@resvg/resvg-js@2.6.2" }, scene: { type: result.scene.type, width: result.scene.width, height: result.scene.height, elementCount: result.scene.elements.length }, outputs: Object.keys(model.files ?? {}).filter((path) => path.startsWith("dist/")).sort().map((path) => ({ path, sha256: model.digests?.[path] })), ...sessionMetadata("diagram-render", grant) });
  }, grant);
  process.stdout.write(`${JSON.stringify({ artifactId, elements: result.scene.elements.length })}\n`);
}

await main().catch((error: unknown) => { process.stderr.write(`[diagram-project-render] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
