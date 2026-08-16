import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { zipSync } from "fflate";

import {
  ACCESSIBILITY_EVIDENCE_SCHEMA,
  DESIGN_EVIDENCE_SCHEMA,
  DESIGN_SYSTEM_SCHEMA,
  PLAN_SCHEMA,
  PROJECT_SCHEMA,
  RENDER_EVIDENCE_SCHEMA,
  REVIEW_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  SLIDE_MANIFEST_SCHEMA,
  STORYBOARD_SCHEMA,
  STRUCTURE_EVIDENCE_SCHEMA,
  computePptxSubjectDigest,
  createPptxReceipt,
  createPptxReleaseManifest,
  type FileContent,
  type PptxModel,
} from "../src/lib/contract.js";

export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const bytes = (value: string) => Buffer.from(value);

export function minimalPng(width = 1600, height = 900) {
  const png = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  return png;
}

export function minimalPptx() {
  const relationship = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  return Buffer.from(zipSync({
    "[Content_Types].xml": bytes("<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>"),
    "_rels/.rels": bytes(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship("rId1", "officeDocument", "ppt/presentation.xml")}</Relationships>`),
    "ppt/presentation.xml": bytes("<?xml version=\"1.0\"?><p:presentation xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"/>"),
    "ppt/_rels/presentation.xml.rels": bytes(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship("rId1", "slide", "slides/slide1.xml")}</Relationships>`),
    "ppt/slides/slide1.xml": bytes("<?xml version=\"1.0\"?><p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"/>"),
    "ppt/slides/_rels/slide1.xml.rels": bytes(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml")}</Relationships>`),
    "ppt/slideLayouts/slideLayout1.xml": bytes("<?xml version=\"1.0\"?><p:sldLayout xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"/>"),
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": bytes(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship("rId1", "slideMaster", "../slideMasters/slideMaster1.xml")}</Relationships>`),
    "ppt/slideMasters/slideMaster1.xml": bytes("<?xml version=\"1.0\"?><p:sldMaster xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"/>"),
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": bytes(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship("rId1", "theme", "../theme/theme1.xml")}</Relationships>`),
    "ppt/theme/theme1.xml": bytes("<?xml version=\"1.0\"?><a:theme xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" name=\"fixture\"/>"),
  }));
}

function hydrate(model: PptxModel) {
  model.digests = Object.fromEntries(Object.entries(model.files ?? {}).map(([path, content]) => [path, sha256(Buffer.isBuffer(content) ? content : String(content ?? ""))]));
  return model;
}

export function sourceModel(artifactId = "deck"): PptxModel {
  const slide = "export function renderSlide(slide, ctx) { slide.addText(ctx.copy.title); }\n";
  const files: Record<string, FileContent> = {
    ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
    "package.json": "{}\n",
    "package-lock.json": "{}\n",
    "plan.contract.json": JSON.stringify({ schema: PLAN_SCHEMA, artifactId, targetStage: "release", audience: "leadership", objective: "inform", language: "zh-CN" }),
    "plan.storyboard.json": JSON.stringify({ schema: STORYBOARD_SCHEMA, slides: [{ index: 1, id: "opening", title: "Opening", role: "opening", visualType: "statement" }] }),
    "plan.skill-composition.json": JSON.stringify({ schema: SKILL_COMPOSITION_SCHEMA, workers: [{ name: "minimax-pptx-generator", revision: "4006c2661305ed221f957a08e1d3429cb525de67", status: "used" }, { name: "impeccable", revision: "skill-v4.1.1", status: "used" }] }),
    "design.system.json": JSON.stringify({ schema: DESIGN_SYSTEM_SCHEMA, colors: { roles: { canvas: "FFFFFF", surface: "F4F6F8", textPrimary: "111827", textSecondary: "374151", accent: "1D4ED8", success: "15803D", warning: "A16207", error: "B91C1C" } }, typography: { roles: Object.fromEntries(["display", "title", "section", "body", "caption", "numeric"].map((role) => [role, { fontFamily: "Noto Sans CJK SC", fontSizePt: role === "body" ? 22 : 28 }])) }, spacing: { pageMarginIn: 0.5, baseUnitIn: 0.125 } }),
    "pptx.project.json": JSON.stringify({ schema: PROJECT_SCHEMA, artifactId, layout: "LAYOUT_16X9", entry: "src/deck.ts", slideManifest: "src/slides/manifest.json", designSystem: "design.system.json" }),
    "src/deck.ts": "const deck = new pptxgen();\ndeck.addSlide();\n",
    "src/theme.ts": "export const theme = {};\n",
    "src/slides/manifest.json": JSON.stringify({ schema: SLIDE_MANIFEST_SCHEMA, slides: [{ index: 1, id: "opening", title: "Opening", role: "opening", source: "001-opening.ts", accessibility: { title: "Opening", readingOrder: ["title"], colorEncoding: ["color", "label"] } }] }),
    "src/slides/001-opening.ts": slide,
  };
  return hydrate({ artifactId, files, project: JSON.parse(String(files["pptx.project.json"])), plan: JSON.parse(String(files["plan.contract.json"])), tracked: [], ignored: [] });
}

export function releaseModel(artifactId = "deck") {
  const model = sourceModel(artifactId);
  const files = model.files ?? {};
  const pptxPath = `dist/${artifactId}.pptx`;
  const pdfPath = `dist/${artifactId}.pdf`;
  const pagePath = "dist/pages/001.png";
  const previewPath = `src/slides/001-opening.${sha256(String(files["src/slides/001-opening.ts"]))}.png`;
  files[pptxPath] = minimalPptx();
  files[pdfPath] = Buffer.from("%PDF-1.7\nfixture\n");
  files[pagePath] = minimalPng();
  files[previewPath] = minimalPng();
  hydrate(model);
  const subjectDigest = computePptxSubjectDigest(model);
  const base = { plugin: "presentation-production", artifactId, subjectDigest };
  files["evidence.render.json"] = JSON.stringify({ schema: RENDER_EVIDENCE_SCHEMA, ...base, sessionId: "render-session", output: { pptxSha256: model.digests?.[pptxPath], pdfSha256: model.digests?.[pdfPath] }, pageCount: 1 });
  files["evidence.structure.json"] = JSON.stringify({ schema: STRUCTURE_EVIDENCE_SCHEMA, ...base, output: { sha256: model.digests?.[pptxPath] }, package: { slideCount: 1 }, verdict: "pass" });
  files["evidence.design.json"] = JSON.stringify({ schema: DESIGN_EVIDENCE_SCHEMA, ...base, designSystemSha256: model.digests?.["design.system.json"], verdict: "pass", checks: [{ source: "measurement", status: "pass" }] });
  files["evidence.accessibility.json"] = JSON.stringify({ schema: ACCESSIBILITY_EVIDENCE_SCHEMA, ...base, outputSha256: model.digests?.[pptxPath], verdict: "pass", checks: [{ source: "tool-report", status: "pass" }] });
  hydrate(model);
  files["review.pptx.json"] = JSON.stringify({ schema: REVIEW_SCHEMA, ...base, verdict: "pass", reviewer: { kind: "independent-agent", id: "reviewer-1", sessionId: "review-session" }, pages: [{ index: 1, sha256: model.digests?.[pagePath], verdict: "pass" }], findings: [] });
  hydrate(model);
  files["release.manifest.json"] = JSON.stringify(createPptxReleaseManifest(model));
  hydrate(model);
  files["receipt.release.json"] = JSON.stringify(createPptxReceipt(model));
  return hydrate(model);
}

export function writeModel(root: string, model: PptxModel) {
  for (const [relativePath, content] of Object.entries(model.files ?? {})) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.isBuffer(content) ? content : String(content ?? ""));
  }
}
