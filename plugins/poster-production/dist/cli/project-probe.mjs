#!/usr/bin/env node
// harness-source-hash: sha256:1a99b67afd74c65d95d81464d3201e20bfa4123e69f24b920c1be5cb984427ad
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-XLAB7OOT.mjs";
import {
  ACCESSIBILITY_EVIDENCE_SCHEMA,
  PROBE_EVIDENCE_SCHEMA,
  assertPosterProjectRoot,
  atomicWriteJson,
  computePosterSubjectDigest,
  inspectPosterPng,
  inspectPosterSvg,
  loadPosterProject,
  sessionMetadata,
  validatePosterModel,
  withWriterJournal
} from "../chunks/chunk-77CKVA44.mjs";

// plugins/poster-production/src/entries/cli/project-probe.ts
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
var sha256 = (value) => createHash("sha256").update(value).digest("hex");
var luminance = (hex) => {
  const values = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * (values[0] ?? 0) + 0.7152 * (values[1] ?? 0) + 0.0722 * (values[2] ?? 0);
};
var contrast = (left, right) => {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
};
async function main() {
  const root = assertPosterProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "poster-probe", argv: processWriterArgv() });
  const model = await loadPosterProject(root);
  if (grant.subjectDigest !== computePosterSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const findings = validatePosterModel(model, { stage: "render" }).filter(({ code }) => code !== "PROBE_EVIDENCE_INVALID" && code !== "ACCESSIBILITY_EVIDENCE_INVALID");
  if (findings.length) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const require2 = createRequire(join(root, "package.json"));
  const { Resvg } = require2("@resvg/resvg-js");
  const manifest = JSON.parse(String(model.files?.["src/variants/manifest.json"]));
  const measurements = [];
  for (const variant of manifest.variants) {
    const svgPath = `dist/${model.artifactId}.${variant.id}.svg`;
    const pngPath = `dist/${model.artifactId}.${variant.id}.png`;
    const svg = await readFile(join(root, svgPath));
    const png = await readFile(join(root, pngPath));
    const svgInspection = inspectPosterSvg(svg);
    const pngInspection = inspectPosterPng(png);
    const independent = new Resvg(svg).render().asPng();
    if (sha256(independent) !== sha256(png)) throw new Error(`SVG_PNG_MISMATCH:${variant.id}`);
    measurements.push({ id: variant.id, svg: svgInspection, png: pngInspection, svgSha256: sha256(svg), pngSha256: sha256(png), independentRasterSha256: sha256(independent) });
  }
  const design = JSON.parse(String(model.files?.["design.system.json"]));
  const contrastChecks = design.contrastPairs.map((pair) => ({ ...pair, value: contrast(design.colors[pair.foreground] ?? "000000", design.colors[pair.background] ?? "FFFFFF") }));
  if (contrastChecks.some((check) => check.value < check.minimum)) throw new Error("DESIGN_CONTRAST_FAILED");
  const typeChecks = Object.entries(design.typography).map(([role, value]) => ({ role, sizePx: value.sizePx, status: value.sizePx >= (role === "caption" ? 18 : 24) ? "pass" : "fail" }));
  if (typeChecks.some((check) => check.status !== "pass")) throw new Error("TYPOGRAPHY_MINIMUM_FAILED");
  const base = { plugin: "poster-production", artifactId: model.artifactId, subjectDigest: computePosterSubjectDigest(model), verdict: "pass", ...sessionMetadata("poster-probe", grant) };
  await withWriterJournal(root, "poster-probe", async () => {
    await atomicWriteJson(root, "evidence.probe.json", { schema: PROBE_EVIDENCE_SCHEMA, ...base, measurements, checks: [{ criterion: "svg-png-byte-equivalence", status: "pass" }, { criterion: "bounded-nonblank-raster", status: "pass" }] });
    await atomicWriteJson(root, "evidence.accessibility.json", { schema: ACCESSIBILITY_EVIDENCE_SCHEMA, ...base, checks: [...contrastChecks.map((check) => ({ criterion: `contrast:${check.foreground}:${check.background}`, status: "pass", value: check.value, minimum: check.minimum })), ...typeChecks], nonColorEncoding: true });
  }, grant);
  process.stdout.write(`${JSON.stringify({ variants: measurements.length, contrastChecks: contrastChecks.length })}
`);
}
main().catch((error) => {
  process.stderr.write(`[poster-project-probe] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
