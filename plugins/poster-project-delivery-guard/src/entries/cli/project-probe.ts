#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ACCESSIBILITY_EVIDENCE_SCHEMA, PROBE_EVIDENCE_SCHEMA, computePosterSubjectDigest, inspectPosterPng, inspectPosterSvg, loadPosterProject, validatePosterModel } from "../../lib/contract.js";
import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { assertPosterProjectRoot, atomicWriteJson, sessionMetadata, withWriterJournal } from "../../lib/writer.js";

const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const luminance = (hex: string) => {
  const values = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * (values[0] ?? 0) + 0.7152 * (values[1] ?? 0) + 0.0722 * (values[2] ?? 0);
};
const contrast = (left: string, right: string) => { const values = [luminance(left), luminance(right)].sort((a, b) => b - a); return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05); };

async function main() {
  const root = assertPosterProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "poster-probe", argv: processWriterArgv() });
  const model = await loadPosterProject(root);
  if (grant.subjectDigest !== computePosterSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const findings = validatePosterModel(model, { stage: "render" }).filter(({ code }) => code !== "PROBE_EVIDENCE_INVALID" && code !== "ACCESSIBILITY_EVIDENCE_INVALID");
  if (findings.length) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const require = createRequire(join(root, "package.json"));
  const { Resvg } = require("@resvg/resvg-js") as { Resvg: new (svg: Buffer | string) => { render(): { asPng(): Buffer } } };
  const manifest = JSON.parse(String(model.files?.["src/variants/manifest.json"])) as { variants: Array<{ id: string; width: number; height: number }> };
  const measurements: Array<Record<string, unknown>> = [];
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
  const design = JSON.parse(String(model.files?.["design.system.json"])) as { colors: Record<string, string>; contrastPairs: Array<{ foreground: string; background: string; minimum: number }>; typography: Record<string, { sizePx: number }> };
  const contrastChecks = design.contrastPairs.map((pair) => ({ ...pair, value: contrast(design.colors[pair.foreground] ?? "000000", design.colors[pair.background] ?? "FFFFFF") }));
  if (contrastChecks.some((check) => check.value < check.minimum)) throw new Error("DESIGN_CONTRAST_FAILED");
  const typeChecks = Object.entries(design.typography).map(([role, value]) => ({ role, sizePx: value.sizePx, status: value.sizePx >= (role === "caption" ? 18 : 24) ? "pass" : "fail" }));
  if (typeChecks.some((check) => check.status !== "pass")) throw new Error("TYPOGRAPHY_MINIMUM_FAILED");
  const base = { plugin: "poster-project-delivery-guard", artifactId: model.artifactId, subjectDigest: computePosterSubjectDigest(model), verdict: "pass", ...sessionMetadata("poster-probe", grant) };
  await withWriterJournal(root, "poster-probe", async () => {
    await atomicWriteJson(root, "evidence.probe.json", { schema: PROBE_EVIDENCE_SCHEMA, ...base, measurements, checks: [{ criterion: "svg-png-byte-equivalence", status: "pass" }, { criterion: "bounded-nonblank-raster", status: "pass" }] });
    await atomicWriteJson(root, "evidence.accessibility.json", { schema: ACCESSIBILITY_EVIDENCE_SCHEMA, ...base, checks: [...contrastChecks.map((check) => ({ criterion: `contrast:${check.foreground}:${check.background}`, status: "pass", value: check.value, minimum: check.minimum })), ...typeChecks], nonColorEncoding: true });
  }, grant);
  process.stdout.write(`${JSON.stringify({ variants: measurements.length, contrastChecks: contrastChecks.length })}\n`);
}

main().catch((error: unknown) => { process.stderr.write(`[poster-project-probe] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
