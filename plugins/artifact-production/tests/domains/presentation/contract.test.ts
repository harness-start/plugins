import assert from "node:assert/strict";
import test from "node:test";

import {
  createPptxReceipt,
  evaluatePptxWrite,
  inspectPptxPackage,
  REVIEW_INPUT_SCHEMA,
  validatePptxModel,
  validatePptxReceipt,
} from "../../../src/domains/presentation/lib/contract.js";
import { minimalPptx, releaseModel, sha256, sourceModel } from "./fixture.js";

test("accepts the strict source-stage project contract", () => {
  assert.equal(REVIEW_INPUT_SCHEMA, "presentation-production/review-input/v4");
  assert.deepEqual(validatePptxModel(sourceModel(), { stage: "source" }), []);
});

test("requires structured audience intent and a rationale for explicit addressing", () => {
  const legacy = sourceModel();
  const legacyPlan = JSON.parse(String(legacy.files?.["plan.contract.json"]));
  legacyPlan.audience = "investors";
  legacy.files!["plan.contract.json"] = JSON.stringify(legacyPlan);
  assert.ok(validatePptxModel(legacy, { stage: "source" }).some(({ code }) => code === "PLAN_INVALID"));

  const unexplained = sourceModel();
  const unexplainedPlan = JSON.parse(String(unexplained.files?.["plan.contract.json"]));
  unexplainedPlan.audience.addressing = "explicit";
  delete unexplainedPlan.audience.explicitRationale;
  unexplained.files!["plan.contract.json"] = JSON.stringify(unexplainedPlan);
  assert.ok(validatePptxModel(unexplained, { stage: "source" }).some(({ code }) => code === "PLAN_INVALID"));
});

test("rejects a visible title wider than ten Han characters", () => {
  const model = sourceModel();
  const storyboard = JSON.parse(String(model.files?.["plan.storyboard.json"]));
  storyboard.slides[0].displayTitle = "兼容主流客户端也兼容主流上游";
  model.files!["plan.storyboard.json"] = JSON.stringify(storyboard);
  assert.ok(validatePptxModel(model, { stage: "source" }).some(({ code }) => code === "DISPLAY_TITLE_INVALID"));
});

test("extracts stable semantic object names, bounds, text, and arrow direction from OOXML", () => {
  const slideXml = `<?xml version="1.0"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld><p:spTree>
        <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
        <p:sp><p:nvSpPr><p:cNvPr id="2" name="pptx:title:opening"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="457200"/><a:ext cx="3657600" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>系统边界</a:t></a:r></a:p></p:txBody></p:sp>
        <p:sp><p:nvSpPr><p:cNvPr id="3" name="pptx:edge:opening:handoff:0"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="1828800" y="2743200"/><a:ext cx="1828800" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln><a:tailEnd type="triangle"/></a:ln></p:spPr></p:sp>
      </p:spTree></p:cSld>
    </p:sld>`;
  const inspection = inspectPptxPackage(minimalPptx(slideXml)) as unknown as { slides: Array<{ objects: Array<Record<string, unknown>> }> };
  assert.deepEqual(inspection.slides[0]?.objects.map(({ name }) => name), ["pptx:title:opening", "pptx:edge:opening:handoff:0"]);
  assert.equal(inspection.slides[0]?.objects[0]?.text, "系统边界");
  assert.equal(inspection.slides[0]?.objects[1]?.endArrow, "triangle");
});

function nativeDiagramXml({ lineX = 3, lineWidth = 2, arrow = true } = {}) {
  const emu = (value: number) => Math.round(value * 914400);
  const shape = (id: number, name: string, x: number, y: number, w: number, h: number) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom></p:spPr></p:sp>`;
  return `<?xml version="1.0"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld><p:spTree>
        <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
        <p:sp><p:nvSpPr><p:cNvPr id="2" name="pptx:title:opening"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(1)}" y="${emu(0.5)}"/><a:ext cx="${emu(4)}" cy="${emu(0.5)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Opening</a:t></a:r></a:p></p:txBody></p:sp>
        ${shape(3, "pptx:node:opening:client", 1, 3, 2, 1)}
        ${shape(4, "pptx:node:opening:gateway", 5, 3, 2, 1)}
        <p:sp><p:nvSpPr><p:cNvPr id="5" name="pptx:edge:opening:request:0"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(lineX)}" y="${emu(3.5)}"/><a:ext cx="${emu(lineWidth)}" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="25400">${arrow ? '<a:tailEnd type="triangle"/>' : ""}</a:ln></p:spPr></p:sp>
      </p:spTree></p:cSld>
    </p:sld>`;
}

function nativeDiagramModel(slideXml: string) {
  const model = releaseModel();
  const storyboard = JSON.parse(String(model.files?.["plan.storyboard.json"]));
  storyboard.slides[0].visual = {
    type: "diagram",
    mode: "native",
    nodes: [
      { id: "client", role: "source" },
      { id: "gateway", role: "target" },
    ],
    relations: [
      { id: "request", from: "client", to: "gateway", kind: "flow", segmentCount: 1 },
    ],
  };
  model.files!["plan.storyboard.json"] = JSON.stringify(storyboard);
  const manifest = JSON.parse(String(model.files?.["src/slides/manifest.json"]));
  manifest.slides[0].visual = { type: "diagram", mode: "native" };
  model.files!["src/slides/manifest.json"] = JSON.stringify(manifest);
  model.files!["dist/deck.pptx"] = minimalPptx(slideXml);
  model.digests!["dist/deck.pptx"] = sha256(model.files!["dist/deck.pptx"] as Buffer);
  return model;
}

test("accepts a native relation whose arrow joins the declared node boundaries", () => {
  const findings = validatePptxModel(nativeDiagramModel(nativeDiagramXml()), { stage: "render" });
  assert.equal(findings.some(({ code }) => code.startsWith("PPTX_RELATION_")), false);
});

test("rejects a floating native connector and a missing target arrow", () => {
  const floating = validatePptxModel(nativeDiagramModel(nativeDiagramXml({ lineX: 3.3, lineWidth: 1.4 })), { stage: "render" });
  assert.ok(floating.some(({ code }) => code === "PPTX_RELATION_GEOMETRY_INVALID"));

  const arrowless = validatePptxModel(nativeDiagramModel(nativeDiagramXml({ arrow: false })), { stage: "render" });
  assert.ok(arrowless.some(({ code }) => code === "PPTX_RELATION_STYLE_INVALID"));
});

test("rejects a native connector that crosses an unrelated node", () => {
  const blocker = '<p:sp><p:nvSpPr><p:cNvPr id="6" name="pptx:node:opening:blocker"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="3383280" y="2971800"/><a:ext cx="548640" cy="457200"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom></p:spPr></p:sp>';
  const xml = nativeDiagramXml().replace(
    '<p:sp><p:nvSpPr><p:cNvPr id="5" name="pptx:edge:opening:request:0"',
    `${blocker}<p:sp><p:nvSpPr><p:cNvPr id="5" name="pptx:edge:opening:request:0"`,
  );
  const model = nativeDiagramModel(xml);
  const storyboard = JSON.parse(String(model.files?.["plan.storyboard.json"]));
  storyboard.slides[0].visual.nodes.push({ id: "blocker", role: "unrelated" });
  model.files!["plan.storyboard.json"] = JSON.stringify(storyboard);
  assert.ok(validatePptxModel(model, { stage: "render" }).some(({ code }) => code === "PPTX_RELATION_GEOMETRY_INVALID"));
});

test("requires a between-node marker instead of a pseudo-connector for disconnection", () => {
  const markerModel = nativeDiagramModel(
    nativeDiagramXml().replace(
      "pptx:edge:opening:request:0",
      "pptx:marker:opening:request",
    ),
  );
  const markerStoryboard = JSON.parse(String(markerModel.files?.["plan.storyboard.json"]));
  markerStoryboard.slides[0].visual.relations[0] = {
    id: "request",
    from: "client",
    to: "gateway",
    kind: "disconnect",
  };
  markerModel.files!["plan.storyboard.json"] = JSON.stringify(markerStoryboard);
  const markerFindings = validatePptxModel(markerModel, { stage: "render" });
  assert.equal(markerFindings.some(({ code }) => code === "PPTX_RELATION_GEOMETRY_INVALID"), false);

  const lineModel = nativeDiagramModel(nativeDiagramXml());
  const lineStoryboard = JSON.parse(String(lineModel.files?.["plan.storyboard.json"]));
  lineStoryboard.slides[0].visual.relations[0] = {
    id: "request",
    from: "client",
    to: "gateway",
    kind: "disconnect",
  };
  lineModel.files!["plan.storyboard.json"] = JSON.stringify(lineStoryboard);
  assert.ok(validatePptxModel(lineModel, { stage: "render" }).some(({ code }) => code === "PPTX_RELATION_GEOMETRY_INVALID"));
});

test("rejects legacy presentation schemas without compatibility fallback", () => {
  const model = sourceModel();
  const plan = JSON.parse(String(model.files?.["plan.contract.json"]));
  plan.schema = "presentation-production/plan/v3";
  model.files!["plan.contract.json"] = JSON.stringify(plan);
  assert.ok(validatePptxModel(model, { stage: "source" }).some(({ code }) => code === "PLAN_INVALID"));
});

test("requires a deck communication core and a contribution from every slide", () => {
  const missing = sourceModel();
  const plan = JSON.parse(String(missing.files?.["plan.contract.json"]));
  delete plan.communicationCore;
  missing.files!["plan.contract.json"] = JSON.stringify(plan);
  assert.ok(validatePptxModel(missing, { stage: "source" }).some(({ code }) => code === "COMMUNICATION_CORE_INVALID"));

  const drifting = sourceModel();
  const storyboard = JSON.parse(String(drifting.files?.["plan.storyboard.json"]));
  delete storyboard.slides[0].coreContribution;
  drifting.files!["plan.storyboard.json"] = JSON.stringify(storyboard);
  assert.ok(validatePptxModel(drifting, { stage: "source" }).some(({ code }) => code === "STORYBOARD_COMMUNICATION_INVALID"));
});

test("release requires a two-pass communication review", () => {
  const model = releaseModel();
  const review = JSON.parse(String(model.files?.["review.pptx.json"]));
  delete review.reviewerRetell;
  model.files!["review.pptx.json"] = JSON.stringify(review);
  assert.ok(validatePptxModel(model, { stage: "release" }).some(({ code }) => code === "COMMUNICATION_REVIEW_INVALID"));

  const unbound = releaseModel();
  const unboundReview = JSON.parse(String(unbound.files?.["review.pptx.json"]));
  unboundReview.communicationReview.signatureCue.anchor = "slide:missing";
  unbound.files!["review.pptx.json"] = JSON.stringify(unboundReview);
  assert.ok(validatePptxModel(unbound, { stage: "release" }).some(({ code }) => code === "COMMUNICATION_REVIEW_INVALID"));
});

test("release requires all presentation quality checks", () => {
  const model = releaseModel();
  const review = JSON.parse(String(model.files?.["review.pptx.json"]));
  delete review.checks.layoutRhythm;
  model.files!["review.pptx.json"] = JSON.stringify(review);
  assert.ok(validatePptxModel(model, { stage: "release" }).some(({ code }) => code === "REVIEW_INVALID"));
});

test("review cannot accept a high-severity finding", () => {
  const model = releaseModel();
  const review = JSON.parse(String(model.files?.["review.pptx.json"]));
  review.findings = [{ id: "f-1", severity: "high", anchor: "slide:opening", evidence: "The cover exposes the private audience brief.", recovery: "Rewrite the cover for the audience rather than naming it.", disposition: "accepted", acceptanceReason: "Deadline" }];
  model.files!["review.pptx.json"] = JSON.stringify(review);
  assert.ok(validatePptxModel(model, { stage: "release" }).some(({ code }) => code === "REVIEW_INVALID"));
});

test("resolved page findings bind their recheck to the current page hash", () => {
  const missingHash = releaseModel();
  const missingHashReview = JSON.parse(String(missingHash.files?.["review.pptx.json"]));
  missingHashReview.findings = [{ id: "f-1", severity: "medium", page: 1, anchor: "slide:opening", evidence: "The original title competed with the visual.", recovery: "Shorten the title and rerender.", disposition: "resolved", resolutionEvidence: "The rerender was checked." }];
  missingHash.files!["review.pptx.json"] = JSON.stringify(missingHashReview);
  assert.ok(validatePptxModel(missingHash, { stage: "release" }).some(({ code }) => code === "REVIEW_INVALID"));

  const currentHash = releaseModel();
  const currentHashReview = JSON.parse(String(currentHash.files?.["review.pptx.json"]));
  currentHashReview.findings = [{ id: "f-1", severity: "medium", page: 1, anchor: "slide:opening", evidence: "The original title competed with the visual.", recovery: "Shorten the title and rerender.", disposition: "resolved", resolutionEvidence: "The current rerender was checked.", resolutionPageSha256: currentHash.digests?.["dist/pages/001.png"] }];
  currentHash.files!["review.pptx.json"] = JSON.stringify(currentHashReview);
  assert.equal(validatePptxModel(currentHash, { stage: "review" }).some(({ code }) => code === "REVIEW_INVALID"), false);
});

test("rejects presentation typography without carrier-specific rhythm and script limits", () => {
  const model = sourceModel();
  const design = JSON.parse(String(model.files!["design.system.json"]));
  design.typography.roles.body = { fontFamily: "Noto Sans CJK SC", fontSizePt: 22 };
  model.files!["design.system.json"] = JSON.stringify(design);

  assert.ok(validatePptxModel(model, { stage: "source" }).some(({ code }) => code === "DESIGN_SYSTEM_INVALID"));
});

test("accepts a valid restricted OOXML package and resolves its internal relationships", () => {
  const inspection = inspectPptxPackage(minimalPptx());
  assert.equal(inspection.slideCount, 1);
  assert.deepEqual(inspection.unresolvedRelationships, []);
  assert.deepEqual(inspection.externalRelationships, []);
});

test("rejects artifact-local ignore rules that hide delivery evidence", () => {
  const model = sourceModel();
  model.files![".gitignore"] += "dist/\n*.png\n";
  assert.deepEqual(validatePptxModel(model, { stage: "source" }).map(({ code }) => code), ["DELIVERY_PATH_IGNORED", "DELIVERY_PATH_IGNORED"]);
});

test("reports a slide module that creates its own page", () => {
  const model = sourceModel();
  model.files!["src/slides/001-opening.ts"] = "export function renderSlide(slide, ctx) { ctx.deck.addSlide(); }\n";
  assert.deepEqual(validatePptxModel(model, { stage: "source" }).map(({ code }) => code), ["SLIDE_OWNER_VIOLATION"]);
});

test("release receipt fails after a source-hash preview byte swap", () => {
  const model = releaseModel();
  const previewPath = Object.keys(model.files!).find((path) => path.startsWith("src/slides/") && path.endsWith(".png"))!;
  const receipt = createPptxReceipt(model);
  assert.equal(receipt.outputs[previewPath], sha256(model.files![previewPath] as Buffer));
  model.files!["receipt.release.json"] = JSON.stringify(receipt);
  assert.equal(validatePptxReceipt(model), true);
  model.files![previewPath] = Buffer.from("SWAPPED-PNG");
  model.digests![previewPath] = sha256(model.files![previewPath] as Buffer);
  assert.equal(validatePptxReceipt(model), false);
});

test("denies direct generated writes while allowing a slide source write", () => {
  assert.equal(evaluatePptxWrite({ relativePath: "artifacts/pptx/quarterly-review/dist/quarterly-review.pptx", toolName: "Write" }).decision, "deny");
  assert.equal(evaluatePptxWrite({ relativePath: "artifacts/pptx/quarterly-review/src/slides/001-opening.abc.png", toolName: "apply_patch" }).decision, "deny");
  assert.deepEqual(evaluatePptxWrite({ relativePath: "artifacts/pptx/quarterly-review/src/slides/001-opening.ts", toolName: "apply_patch" }), { decision: "allow" });
});

test("accepts a fully bound release model", () => {
  assert.deepEqual(validatePptxModel(releaseModel(), { stage: "release" }), []);
});

test("rejects a hand-written release receipt that is not bound to current sources and outputs", () => {
  const model = releaseModel();
  model.files!["receipt.release.json"] = "{}\n";
  assert.ok(validatePptxModel(model, { stage: "release" }).some(({ code }) => code === "RECEIPT_INVALID"));
});

test("rejects placeholder release bytes and empty evidence even when the receipt is current", () => {
  const model = releaseModel();
  model.files!["dist/deck.pptx"] = Buffer.from("PPTX");
  model.files!["dist/deck.pdf"] = Buffer.from("PDF");
  model.files!["dist/pages/001.png"] = Buffer.from("PNG");
  model.files!["evidence.structure.json"] = "{}\n";
  model.files!["evidence.accessibility.json"] = "{}\n";
  model.files!["release.manifest.json"] = "{}\n";
  model.files!["receipt.release.json"] = JSON.stringify(createPptxReceipt(model));
  const codes = validatePptxModel(model, { stage: "release" }).map(({ code }) => code);
  assert.ok(codes.includes("PPTX_INVALID"));
  assert.ok(codes.includes("PDF_INVALID"));
  assert.ok(codes.includes("PNG_INVALID"));
  assert.ok(codes.includes("STRUCTURE_EVIDENCE_INVALID"));
  assert.ok(codes.includes("ACCESSIBILITY_EVIDENCE_INVALID"));
  assert.ok(codes.includes("RELEASE_MANIFEST_INVALID"));
});

test("rejects an unknown validation stage instead of falling back to source checks", () => {
  assert.deepEqual(validatePptxModel(sourceModel(), { stage: "RELEASE" }).map(({ code }) => code), ["STAGE_INVALID"]);
});
