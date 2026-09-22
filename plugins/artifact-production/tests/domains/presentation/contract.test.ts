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
  assert.equal(REVIEW_INPUT_SCHEMA, "presentation-production/review-input/v5");
  assert.deepEqual(validatePptxModel(sourceModel(), { stage: "source" }), []);
});

test("requires an explicit headline mode and visual logic on every slide", () => {
  const model = sourceModel();
  const storyboard = JSON.parse(String(model.files?.["plan.storyboard.json"]));
  delete storyboard.slides[0].headline;
  delete storyboard.slides[0].visual.logic;
  model.files!["plan.storyboard.json"] = JSON.stringify(storyboard);

  const codes = validatePptxModel(model, { stage: "source" }).map(({ code }) => code);
  assert.ok(codes.includes("STORYBOARD_INVALID"));
  assert.ok(codes.includes("STORYBOARD_VISUAL_INVALID"));
});

test("requires output-bound typography rhythm instead of a paragraph gap proxy", () => {
  const model = sourceModel();
  const design = JSON.parse(String(model.files?.["design.system.json"]));
  delete design.typography.roles.body.paragraphSpaceAfterPt;
  delete design.typography.roles.body.horizontalAlign;
  delete design.typography.roles.body.verticalAlign;
  delete design.typography.roles.body.marginPt;
  model.files!["design.system.json"] = JSON.stringify(design);

  assert.ok(validatePptxModel(model, { stage: "source" }).some(({ code }) => code === "DESIGN_SYSTEM_INVALID"));
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

test("extracts paragraph rhythm, alignment, bullets, and autofit from OOXML", () => {
  const slideXml = `<?xml version="1.0"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld><p:spTree>
        <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
        <p:sp><p:nvSpPr><p:cNvPr id="2" name="pptx:list:opening:list:clients"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="457200"/><a:ext cx="3657600" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr anchor="t" lIns="91440"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="l"><a:lnSpc><a:spcPct val="135000"/></a:lnSpc><a:spcBef><a:spcPts val="300"/></a:spcBef><a:spcAft><a:spcPts val="600"/></a:spcAft><a:buChar char="•"/></a:pPr><a:r><a:rPr sz="2200"/><a:t>Codex</a:t></a:r></a:p></p:txBody></p:sp>
      </p:spTree></p:cSld></p:sld>`;
  const object = inspectPptxPackage(minimalPptx(slideXml)).slides[0]?.objects[0];
  assert.equal(object?.lineSpacingMultiple, 1.35);
  assert.equal(object?.paragraphSpaceAfterPt, 6);
  assert.equal(object?.horizontalAlign, "left");
  assert.equal(object?.verticalAlign, "top");
  assert.equal(object?.bulletKind, "bullet");
  assert.equal(object?.autofit, "shrink");
});

test("rejects renderer-dependent autofit on governed text", () => {
  const model = releaseModel();
  model.files!["dist/deck.pptx"] = minimalPptx(
    nativeDiagramXml().replace(
      '<a:bodyPr anchor="t" lIns="0"/>',
      '<a:bodyPr anchor="t" lIns="0"><a:normAutofit/></a:bodyPr>',
    ),
  );
  model.digests!["dist/deck.pptx"] = sha256(model.files!["dist/deck.pptx"] as Buffer);
  assert.ok(validatePptxModel(model, { stage: "render" }).some(({ code }) => code === "PPTX_TEXT_RHYTHM_INVALID"));
});

test("rejects a visible text box that bypasses semantic typography naming", () => {
  const rawText = '<p:sp><p:nvSpPr><p:cNvPr id="9" name="Text 99"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="1371600"/><a:ext cx="3657600" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr anchor="t" lIns="0"/><a:lstStyle/><a:p><a:pPr algn="l"><a:lnSpc><a:spcPct val="135000"/></a:lnSpc><a:spcAft><a:spcPts val="600"/></a:spcAft></a:pPr><a:r><a:rPr sz="2200"><a:latin typeface="Noto Sans CJK SC"/></a:rPr><a:t>Ungoverned text</a:t></a:r></a:p></p:txBody></p:sp>';
  const model = releaseModel();
  model.files!["dist/deck.pptx"] = minimalPptx(
    nativeDiagramXml().replace("</p:spTree>", `${rawText}</p:spTree>`),
  );
  model.digests!["dist/deck.pptx"] = sha256(model.files!["dist/deck.pptx"] as Buffer);
  assert.ok(validatePptxModel(model, { stage: "render" }).some(({ code }) => code === "PPTX_TEXT_RHYTHM_INVALID"));
});

function nativeDiagramXml({ lineX = 3, lineWidth = 2, arrow = true } = {}) {
  const emu = (value: number) => Math.round(value * 914400);
  const shape = (id: number, name: string, x: number, y: number, w: number, h: number) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom></p:spPr></p:sp>`;
  return `<?xml version="1.0"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld><p:spTree>
        <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
        <p:sp><p:nvSpPr><p:cNvPr id="2" name="pptx:title:opening:display"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(1)}" y="${emu(0.5)}"/><a:ext cx="${emu(4)}" cy="${emu(0.5)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr anchor="t" lIns="0"/><a:lstStyle/><a:p><a:pPr algn="l"><a:lnSpc><a:spcPct val="115000"/></a:lnSpc><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr><a:r><a:rPr sz="2800"><a:latin typeface="Noto Sans CJK SC"/></a:rPr><a:t>Opening</a:t></a:r></a:p></p:txBody></p:sp>
        ${shape(3, "pptx:node:opening:client:body", 1, 3, 2, 1)}
        ${shape(4, "pptx:node:opening:gateway:body", 5, 3, 2, 1)}
        <p:sp><p:nvSpPr><p:cNvPr id="5" name="pptx:edge:opening:request:0"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(lineX)}" y="${emu(3.5)}"/><a:ext cx="${emu(lineWidth)}" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="25400">${arrow ? '<a:tailEnd type="triangle"/>' : ""}</a:ln></p:spPr></p:sp>
      </p:spTree></p:cSld>
    </p:sld>`;
}

function nativeDiagramModel(slideXml: string) {
  const model = releaseModel();
  const storyboard = JSON.parse(String(model.files?.["plan.storyboard.json"]));
  storyboard.slides[0].visual = {
    type: "diagram",
    logic: "sequence",
    mode: "native",
    readingDirection: "left-to-right",
    nodes: [
      { id: "client", role: "source", typographyRole: "body" },
      { id: "gateway", role: "target", typographyRole: "body" },
    ],
    relations: [
      { id: "request", from: "client", to: "gateway", kind: "flow", pathRole: "forward", segmentCount: 1 },
    ],
  };
  model.files!["plan.storyboard.json"] = JSON.stringify(storyboard);
  const manifest = JSON.parse(String(model.files?.["src/slides/manifest.json"]));
  manifest.slides[0].visual = { type: "diagram", logic: "sequence", mode: "native", readingDirection: "left-to-right" };
  model.files!["src/slides/manifest.json"] = JSON.stringify(manifest);
  model.files!["dist/deck.pptx"] = minimalPptx(slideXml);
  model.digests!["dist/deck.pptx"] = sha256(model.files!["dist/deck.pptx"] as Buffer);
  return model;
}

test("accepts a native relation whose arrow joins the declared node boundaries", () => {
  const findings = validatePptxModel(nativeDiagramModel(nativeDiagramXml()), { stage: "render" });
  assert.equal(findings.some(({ code }) => code.startsWith("PPTX_RELATION_")), false);
});

test("rejects a declared cycle without a return path", () => {
  const model = nativeDiagramModel(nativeDiagramXml());
  const storyboard = JSON.parse(String(model.files?.["plan.storyboard.json"]));
  storyboard.slides[0].visual.logic = "cycle";
  storyboard.slides[0].visual.readingDirection = "clockwise";
  storyboard.slides[0].visual.relations[0].pathRole = "forward";
  model.files!["plan.storyboard.json"] = JSON.stringify(storyboard);

  assert.ok(validatePptxModel(model, { stage: "source" }).some(({ code }) => code === "NATIVE_DIAGRAM_INVALID"));
});

test("requires rationale for a top-to-bottom wide-screen sequence", () => {
  const model = nativeDiagramModel(nativeDiagramXml());
  const storyboard = JSON.parse(String(model.files?.["plan.storyboard.json"]));
  storyboard.slides[0].visual.logic = "sequence";
  storyboard.slides[0].visual.readingDirection = "top-to-bottom";
  storyboard.slides[0].visual.relations[0].pathRole = "forward";
  model.files!["plan.storyboard.json"] = JSON.stringify(storyboard);

  assert.ok(validatePptxModel(model, { stage: "source" }).some(({ code }) => code === "NATIVE_DIAGRAM_INVALID"));
});

test("rejects a forward relation that runs against the declared reading direction", () => {
  const model = nativeDiagramModel(nativeDiagramXml());
  const storyboard = JSON.parse(String(model.files?.["plan.storyboard.json"]));
  storyboard.slides[0].visual.relations[0].from = "gateway";
  storyboard.slides[0].visual.relations[0].to = "client";
  model.files!["plan.storyboard.json"] = JSON.stringify(storyboard);

  assert.ok(validatePptxModel(model, { stage: "render" }).some(({ code }) => code === "PPTX_READING_DIRECTION_INVALID"));
});

test("requires a declared group to render its actual encoding", () => {
  const model = releaseModel();
  const storyboard = JSON.parse(String(model.files?.["plan.storyboard.json"]));
  storyboard.slides[0].visual = {
    type: "content",
    logic: "group",
    groups: [{ id: "clients", encoding: "bulleted", itemCount: 3 }],
  };
  model.files!["plan.storyboard.json"] = JSON.stringify(storyboard);
  const manifest = JSON.parse(String(model.files?.["src/slides/manifest.json"]));
  manifest.slides[0].visual = { type: "content", logic: "group" };
  model.files!["src/slides/manifest.json"] = JSON.stringify(manifest);

  assert.ok(validatePptxModel(model, { stage: "render" }).some(({ code }) => code === "PPTX_GROUP_ENCODING_INVALID"));
});

test("rejects a floating native connector and a missing target arrow", () => {
  const floating = validatePptxModel(nativeDiagramModel(nativeDiagramXml({ lineX: 3.3, lineWidth: 1.4 })), { stage: "render" });
  assert.ok(floating.some(({ code }) => code === "PPTX_RELATION_GEOMETRY_INVALID"));

  const arrowless = validatePptxModel(nativeDiagramModel(nativeDiagramXml({ arrow: false })), { stage: "render" });
  assert.ok(arrowless.some(({ code }) => code === "PPTX_RELATION_STYLE_INVALID"));
});

test("rejects a native connector that crosses an unrelated node", () => {
  const blocker = '<p:sp><p:nvSpPr><p:cNvPr id="6" name="pptx:node:opening:blocker:body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="3383280" y="2971800"/><a:ext cx="548640" cy="457200"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom></p:spPr></p:sp>';
  const xml = nativeDiagramXml().replace(
    '<p:sp><p:nvSpPr><p:cNvPr id="5" name="pptx:edge:opening:request:0"',
    `${blocker}<p:sp><p:nvSpPr><p:cNvPr id="5" name="pptx:edge:opening:request:0"`,
  );
  const model = nativeDiagramModel(xml);
  const storyboard = JSON.parse(String(model.files?.["plan.storyboard.json"]));
  storyboard.slides[0].visual.nodes.push({ id: "blocker", role: "unrelated", typographyRole: "body" });
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
    pathRole: "forward",
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
    pathRole: "forward",
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

test("release requires hash-bound per-page visual audits", () => {
  const model = releaseModel();
  const review = JSON.parse(String(model.files?.["review.pptx.json"]));
  delete review.pages[0].audits;
  model.files!["review.pptx.json"] = JSON.stringify(review);

  assert.ok(validatePptxModel(model, { stage: "release" }).some(({ code }) => code === "REVIEW_INVALID"));
});

test("page audits must dispose probe signals and cannot pass a formulaic title", () => {
  const model = releaseModel();
  const design = JSON.parse(String(model.files?.["evidence.design.json"]));
  design.headlineSignals = [{ page: 1, title: "Opening", signals: ["balanced-clauses"] }];
  design.compositionSignals[0].signals = ["equal-object-grid"];
  model.files!["evidence.design.json"] = JSON.stringify(design);
  const review = JSON.parse(String(model.files?.["review.pptx.json"]));
  review.pages[0].audits.headlineVoice.classification = "formulaic";
  model.files!["review.pptx.json"] = JSON.stringify(review);

  assert.ok(validatePptxModel(model, { stage: "review" }).some(({ code }) => code === "REVIEW_INVALID"));

  review.pages[0].audits.headlineVoice.classification = "plain";
  review.pages[0].audits.headlineVoice.signalDisposition = "The signal is a false positive because the title is a single concrete noun.";
  review.pages[0].audits.contentEncoding.signalDisposition = "The equal regions encode distinct evidence categories rather than repeated prose.";
  model.files!["review.pptx.json"] = JSON.stringify(review);
  assert.equal(validatePptxModel(model, { stage: "review" }).some(({ code }) => code === "REVIEW_INVALID"), false);
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
