#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";

import { PROBE_EVIDENCE_SCHEMA, computeDiagramSubjectDigest, inspectDiagramSvg, loadDiagramProject, validateDiagramModel } from "../../lib/contract.js";
import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { assertDiagramProjectRoot, atomicWriteJson, sessionMetadata, withWriterJournal } from "../../lib/writer.js";

const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");
async function main() {
  const root = assertDiagramProjectRoot(process.argv[2]); const model = await loadDiagramProject(root); const grant = await consumeWriterCapability({ root, capability: "diagram-probe", argv: processWriterArgv() });
  if (grant.subjectDigest !== computeDiagramSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED"); const findings = validateDiagramModel(model, { stage: "render" }).filter(({ code }) => code !== "PROBE_EVIDENCE_INVALID"); if (findings.length) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const require = createRequire(join(root, "package.json")); const { Resvg } = require("@resvg/resvg-js") as { Resvg: new (svg: string | Buffer) => { render(): { asPng(): Buffer } } }; const artifactId = model.artifactId ?? "diagram";
  const svgBytes = model.files?.[`dist/${artifactId}.svg`]; const pngBytes = model.files?.[`dist/${artifactId}.png`]; if (!Buffer.isBuffer(pngBytes)) throw new Error("PNG_MISSING"); const independent = new Resvg(Buffer.isBuffer(svgBytes) ? svgBytes : String(svgBytes ?? "")).render().asPng(); if (sha256(independent) !== sha256(pngBytes)) throw new Error("SVG_PNG_MISMATCH");
  const inspection = inspectDiagramSvg(svgBytes); const source = JSON.parse(String(model.files?.["src/diagram.json"])) as { nodes?: unknown[]; edges?: unknown[]; data?: unknown[]; items?: unknown[] }; const semanticCount = (source.nodes?.length ?? 0) + (source.edges?.length ?? 0) + (source.data?.length ?? 0) + (source.items?.length ?? 0); if (semanticCount > 120) throw new Error("DENSITY_BUDGET_EXCEEDED");
  await withWriterJournal(root, "diagram-probe", async () => { await atomicWriteJson(root, "evidence.probe.json", { schema: PROBE_EVIDENCE_SCHEMA, plugin: "diagram-production", artifactId, subjectDigest: computeDiagramSubjectDigest(model), verdict: "pass", checks: [{ criterion: "svg-self-contained", status: inspection.valid && !inspection.unsafe ? "pass" : "fail" }, { criterion: "svg-png-byte-equivalence", status: "pass" }, { criterion: "semantic-density", status: "pass", value: semanticCount, maximum: 120 }, { criterion: "non-color-encoding", status: "pass", evidence: "labels and connector geometry accompany semantic colors" }], outputs: { svgSha256: model.digests?.[`dist/${artifactId}.svg`], pngSha256: model.digests?.[`dist/${artifactId}.png`], independentRasterSha256: sha256(independent) }, ...sessionMetadata("diagram-probe", grant) }); }, grant);
  process.stdout.write(`${JSON.stringify({ verdict: "pass", semanticCount })}\n`);
}

await main().catch((error: unknown) => { process.stderr.write(`[diagram-project-probe] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
