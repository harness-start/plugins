#!/usr/bin/env node
// harness-source-hash: sha256:96285819d663dfc409e440d954769bd9efcd98acff907031f193255ff8195570
import {
  pdfPageCount,
  toolVersion
} from "../chunks/chunk-VAXEMDGA.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-MZ4KGSY5.mjs";
import {
  assertPptxProjectRoot,
  atomicWriteJson,
  sessionMetadata,
  withWriterJournal
} from "../chunks/chunk-SW3JQKS7.mjs";
import {
  ACCESSIBILITY_EVIDENCE_SCHEMA,
  DESIGN_EVIDENCE_SCHEMA,
  STRUCTURE_EVIDENCE_SCHEMA,
  computePptxSubjectDigest,
  inspectPptxPackage,
  loadPptxProject,
  validatePptxModel
} from "../chunks/chunk-CW64IWON.mjs";

// plugins/presentation-production/src/entries/cli/project-probe.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
function luminance(hex) {
  const values = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).map(
    (value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * (values[0] ?? 0) + 0.7152 * (values[1] ?? 0) + 0.0722 * (values[2] ?? 0);
}
function contrast(left, right) {
  const [lighter, darker] = [luminance(left), luminance(right)].sort(
    (a, b) => b - a
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}
async function main() {
  const root = assertPptxProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({
    root,
    capability: "pptx-probe",
    argv: processWriterArgv()
  });
  let model = await loadPptxProject(root);
  if (grant.subjectDigest !== computePptxSubjectDigest(model))
    throw new Error("WRITER_SUBJECT_CHANGED");
  const findings = validatePptxModel(model, { stage: "render" }).filter(
    ({ code }) => ![
      "STRUCTURE_EVIDENCE_INVALID",
      "DESIGN_EVIDENCE_INVALID",
      "ACCESSIBILITY_EVIDENCE_INVALID"
    ].includes(code)
  );
  if (findings.length)
    throw new Error(
      findings.map(({ code, path }) => `${code}:${path}`).join(", ")
    );
  const pptxPath = `dist/${model.artifactId}.pptx`;
  const pdfPath = `dist/${model.artifactId}.pdf`;
  const packageInspection = inspectPptxPackage(
    await readFile(join(root, pptxPath))
  );
  const storyboard = record(JSON.parse(String(model.files?.["plan.storyboard.json"])));
  const storyboardSlides = Array.isArray(storyboard.slides) ? storyboard.slides.map(record) : [];
  const diagramDigests = storyboardSlides.filter((slide) => slide.visualType === "diagram").map((slide) => record(slide.diagram).sha256).filter((value) => typeof value === "string");
  if (diagramDigests.length && (packageInspection.externalRelationships.length || diagramDigests.some((expected) => !packageInspection.media.some(({ sha256 }) => sha256 === expected)))) throw new Error("DIAGRAM_MEDIA_MISMATCH");
  const pageCount = await pdfPageCount(join(root, pdfPath), { cwd: root });
  const design = record(
    JSON.parse(String(model.files?.["design.system.json"]))
  );
  const colorRoles = record(record(design.colors).roles);
  const typographyRoles = record(record(design.typography).roles);
  const textPrimary = String(colorRoles.textPrimary ?? "");
  const textSecondary = String(colorRoles.textSecondary ?? "");
  const canvas = String(colorRoles.canvas ?? "");
  const bodyContrast = contrast(textPrimary, canvas);
  const secondaryContrast = contrast(textSecondary, canvas);
  if (bodyContrast < 4.5 || secondaryContrast < 4.5)
    throw new Error("DESIGN_CONTRAST_FAILED");
  const typographyChecks = Object.entries(typographyRoles).map(
    ([role, raw]) => {
      const value = record(raw);
      const pass = Number(value.fontSizePt) > 0 && Number(value.lineSpacingMultiple) >= 1 && Number(value.lineSpacingMultiple) <= 2 && Number.isFinite(value.charSpacingPt) && Number(value.charSpacingPt) >= -1 && Number(value.charSpacingPt) <= 10 && Number.isInteger(value.maxLines) && Number(value.maxLines) > 0 && ["cjk", "latin", "mixed"].includes(String(value.scriptPolicy));
      if (!pass) throw new Error(`DESIGN_TYPOGRAPHY_FAILED:${role}`);
      return {
        criterion: `typography:${role}`,
        source: "design-system-measurement",
        status: "pass",
        fontSizePt: value.fontSizePt,
        lineSpacingMultiple: value.lineSpacingMultiple,
        charSpacingPt: value.charSpacingPt,
        maxLines: value.maxLines,
        scriptPolicy: value.scriptPolicy
      };
    }
  );
  const manifest = record(
    JSON.parse(String(model.files?.["src/slides/manifest.json"]))
  );
  const slides = Array.isArray(manifest.slides) ? manifest.slides.map(record) : [];
  const accessibilityChecks = [];
  for (const slide of slides) {
    const accessibility = record(slide.accessibility);
    const pass = typeof accessibility.title === "string" && accessibility.title.length > 0 && Array.isArray(accessibility.readingOrder) && accessibility.readingOrder.length > 0 && Array.isArray(accessibility.colorEncoding) && accessibility.colorEncoding.some((channel) => channel !== "color");
    if (!pass)
      throw new Error(`ACCESSIBILITY_DECLARATION_INVALID:${String(slide.id)}`);
    accessibilityChecks.push({
      criterion: "fixed-document-title-order-non-color",
      page: slide.index,
      source: "tool-report",
      status: "pass"
    });
  }
  const base = {
    plugin: "presentation-production",
    artifactId: model.artifactId,
    subjectDigest: computePptxSubjectDigest(model),
    ...sessionMetadata("pptx-probe", grant)
  };
  await withWriterJournal(
    root,
    "pptx-probe",
    async () => {
      await atomicWriteJson(root, "evidence.structure.json", {
        schema: STRUCTURE_EVIDENCE_SCHEMA,
        ...base,
        output: {
          path: pptxPath,
          sha256: model.digests?.[pptxPath],
          pdfPath,
          pdfSha256: model.digests?.[pdfPath]
        },
        package: packageInspection,
        pageCount,
        tool: { name: "pptx-opc-validator", version: "2" },
        verdict: "pass"
      });
      await atomicWriteJson(root, "evidence.design.json", {
        schema: DESIGN_EVIDENCE_SCHEMA,
        ...base,
        designSystemSha256: model.digests?.["design.system.json"],
        verdict: "pass",
        checks: [
          {
            criterion: "body-text-contrast",
            source: "measurement",
            status: "pass",
            value: bodyContrast,
            minimum: 4.5
          },
          {
            criterion: "secondary-text-contrast",
            source: "measurement",
            status: "pass",
            value: secondaryContrast,
            minimum: 4.5
          },
          ...typographyChecks
        ]
      });
      await atomicWriteJson(root, "evidence.accessibility.json", {
        schema: ACCESSIBILITY_EVIDENCE_SCHEMA,
        ...base,
        outputSha256: model.digests?.[pptxPath],
        verdict: "pass",
        checks: accessibilityChecks,
        tools: {
          pdfinfo: await toolVersion("pdfinfo", ["-v"]).catch(() => "pdfinfo")
        }
      });
    },
    grant
  );
  model = await loadPptxProject(root);
  process.stdout.write(
    `${JSON.stringify({ structure: model.digests?.["evidence.structure.json"], design: model.digests?.["evidence.design.json"], accessibility: model.digests?.["evidence.accessibility.json"] })}
`
  );
}
main().catch((error) => {
  process.stderr.write(
    `[pptx-project-probe] ${error instanceof Error ? error.message : String(error)}
`
  );
  process.exitCode = 2;
});
