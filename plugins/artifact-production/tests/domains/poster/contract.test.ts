import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCESSIBILITY_EVIDENCE_SCHEMA,
  ART_DIRECTION_SCHEMA,
  COMPOSITION_EVIDENCE_SCHEMA,
  DESIGN_SYSTEM_SCHEMA,
  LAYER_MANIFEST_SCHEMA,
  REVIEW_SCHEMA,
  VARIANT_MANIFEST_SCHEMA,
  computePosterSubjectDigest,
  createPosterReceipt,
  evaluatePosterWrite,
  measureMaskGeometry,
  measureMaskRegionOccupancy,
  posterForegroundMask,
  validatePosterModel,
  validatePosterReceipt,
} from "../../../src/domains/poster/lib/contract.js";
import { makePng, sha256, validPosterModel } from "./fixture.js";

test("publishes the breaking v4 communication contracts", () => {
  assert.equal(ART_DIRECTION_SCHEMA, "poster-production/art-direction/v4");
  assert.equal(DESIGN_SYSTEM_SCHEMA, "poster-production/design-system/v3");
  assert.equal(VARIANT_MANIFEST_SCHEMA, "poster-production/variant-manifest/v3");
  assert.equal(LAYER_MANIFEST_SCHEMA, "poster-production/layer-manifest/v3");
  assert.equal(ACCESSIBILITY_EVIDENCE_SCHEMA, "poster-production/accessibility/v3");
  assert.equal(COMPOSITION_EVIDENCE_SCHEMA, "poster-production/composition/v2");
  assert.equal(REVIEW_SCHEMA, "poster-production/review/v4");
});

test("accepts the complete v3 source contract", () => {
  assert.deepEqual(validatePosterModel(validPosterModel("source"), { stage: "source" }), []);
});

test("requires a semantically anchored communication core", () => {
  const missing = validPosterModel("source");
  const missingDirection = JSON.parse(String(missing.files!["plan.art-direction.json"]));
  delete missingDirection.communicationCore;
  missing.files!["plan.art-direction.json"] = JSON.stringify(missingDirection);
  assert.ok(validatePosterModel(missing, { stage: "source" }).some(({ code }) => code === "COMMUNICATION_CORE_INVALID"));

  const unbound = validPosterModel("source");
  const unboundDirection = JSON.parse(String(unbound.files!["plan.art-direction.json"]));
  unboundDirection.communicationCore.signatureCue.anchors = ["layer:missing"];
  unbound.files!["plan.art-direction.json"] = JSON.stringify(unboundDirection);
  assert.ok(validatePosterModel(unbound, { stage: "source" }).some(({ code }) => code === "COMMUNICATION_CUE_UNBOUND"));
});

test("release requires a two-pass communication review", () => {
  const model = validPosterModel("release");
  const review = JSON.parse(String(model.files!["review.poster.json"]));
  delete review.communicationReview.retellAlignment;
  model.files!["review.poster.json"] = JSON.stringify(review);
  assert.ok(validatePosterModel(model, { stage: "release" }).some(({ code }) => code === "COMMUNICATION_REVIEW_INVALID"));

  const unbound = validPosterModel("release");
  const unboundReview = JSON.parse(String(unbound.files!["review.poster.json"]));
  unboundReview.communicationReview.signatureCue.anchor = "layer:missing";
  unbound.files!["review.poster.json"] = JSON.stringify(unboundReview);
  assert.ok(validatePosterModel(unbound, { stage: "release" }).some(({ code }) => code === "COMMUNICATION_REVIEW_INVALID"));
});

test("source rejects typography roles without measurable spacing and script policy", () => {
  const model = validPosterModel("source");
  const design = JSON.parse(String(model.files!["design.system.json"]));
  design.typography.display = { family: "Noto Sans SC", sizePx: 72, weight: 700 };
  model.files!["design.system.json"] = JSON.stringify(design);

  assert.ok(validatePosterModel(model, { stage: "source" }).some(({ code }) => code === "DESIGN_SYSTEM_INVALID"));
});

test("source rejects typography whose declared family and weight are not backed by the font registry", () => {
  const model = validPosterModel("source");
  const design = JSON.parse(String(model.files!["design.system.json"]));
  design.typography.display.families = { cjk: "Unregistered Display", latin: "Unregistered Display" };
  model.files!["design.system.json"] = JSON.stringify(design);

  assert.ok(validatePosterModel(model, { stage: "source" }).some(({ code }) => code === "DESIGN_SYSTEM_INVALID"));
});

test("source rejects a mixed-script role unless both CJK and Latin font files are registered", () => {
  const model = validPosterModel("source");
  const design = JSON.parse(String(model.files!["design.system.json"]));
  design.fontRegistry[0].files = design.fontRegistry[0].files.filter(({ script }: { script: string }) => script !== "cjk");
  model.files!["design.system.json"] = JSON.stringify(design);

  assert.ok(validatePosterModel(model, { stage: "source" }).some(({ code }) => code === "DESIGN_SYSTEM_INVALID"));
});

test("source rejects a palette without structural roles and scenarios", () => {
  const model = validPosterModel("source");
  const design = JSON.parse(String(model.files!["design.system.json"]));
  delete design.colors.structuralRoles;
  delete design.colors.scenarios;
  model.files!["design.system.json"] = JSON.stringify(design);

  assert.ok(validatePosterModel(model, { stage: "source" }).some(({ code }) => code === "DESIGN_SYSTEM_INVALID"));
});

test("source rejects free-form art direction without letterform and composition contracts", () => {
  const model = validPosterModel("source");
  const art = JSON.parse(String(model.files!["plan.art-direction.json"]));
  delete art.letterform;
  delete art.composition;
  model.files!["plan.art-direction.json"] = JSON.stringify(art);

  assert.ok(validatePosterModel(model, { stage: "source" }).some(({ code }) => code === "ART_DIRECTION_INVALID"));
});

test("foreground measurement distinguishes canvas pixels from visible poster mass", () => {
  assert.equal(posterForegroundMask(makePng(20, 10), "F4F0E8").foregroundCoverage, 0);
  assert.equal(posterForegroundMask(makePng(20, 10, [17, 17, 17, 255]), "F4F0E8").foregroundCoverage, 1);
});

test("mask geometry measures normalized focal bounds, centroid, and regional occupancy", () => {
  const mask = Uint8Array.from([
    0, 0, 0, 0,
    0, 1, 1, 0,
    0, 1, 1, 0,
    0, 0, 0, 0,
  ]);
  assert.deepEqual(measureMaskGeometry(mask, 4, 4), {
    occupancy: 0.25,
    bbox: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    centroid: { x: 0.5, y: 0.5 },
  });
  assert.equal(measureMaskRegionOccupancy(mask, 4, 4, { x: 0, y: 0, width: 0.5, height: 0.5 }), 0.25);
});

test("render rejects stub proof bytes that are not decoded PNG or parsed SVG", () => {
  const model = validPosterModel("render");
  const proofPaths = Object.keys(model.files ?? {}).filter((path) => path.startsWith("evidence/layers/"));
  for (const path of proofPaths) model.files![path] = path.endsWith(".png") ? "PNG" : "SVG";
  const codes = new Set(validatePosterModel(model, { stage: "render" }).map(({ code }) => code));
  assert.ok(codes.has("LAYER_PROOF_INVALID"));
});

test("render reports forbidden zIndex and source-hash proof invalidation", () => {
  const model = validPosterModel("render");
  model.files!["src/variants/001-main/layers/001-background-base.tsx"] = "export function buildLayer() { return <div style={{ zIndex: 2 }} />; }\n";
  const codes = validatePosterModel(model, { stage: "render" }).map(({ code }) => code);
  assert.ok(codes.includes("LAYER_OWNER_VIOLATION"));
  assert.equal(codes.filter((code) => code === "LAYER_PROOF_MISSING").length, 2);
});

test("render evidence must enumerate and digest-bind every generated output", () => {
  const model = validPosterModel("render");
  const evidence = JSON.parse(String(model.files!["evidence.render.json"]));
  evidence.outputs.pop();
  model.files!["evidence.render.json"] = JSON.stringify(evidence);
  assert.ok(validatePosterModel(model, { stage: "render" }).some(({ code }) => code === "RENDER_EVIDENCE_INVALID"));
});

test("probe and review cannot pass with empty measurements or visual checks", () => {
  const model = validPosterModel("review");
  const probe = JSON.parse(String(model.files!["evidence.probe.json"]));
  probe.measurements = [];
  model.files!["evidence.probe.json"] = JSON.stringify(probe);
  const review = JSON.parse(String(model.files!["review.poster.json"]));
  review.checks = {};
  model.files!["review.poster.json"] = JSON.stringify(review);
  const codes = new Set(validatePosterModel(model, { stage: "review" }).map(({ code }) => code));
  assert.ok(codes.has("PROBE_EVIDENCE_INVALID"));
  assert.ok(codes.has("REVIEW_INVALID"));
});

test("review closure rejects accepted high-severity findings", () => {
  const model = validPosterModel("review");
  const review = JSON.parse(String(model.files!["review.poster.json"]));
  review.findings = [{ severity: "high", anchor: "variant:main", evidence: "The focal subject is unreadable at thumbnail size.", recovery: "Increase focal contrast and rerun review.", disposition: "accepted" }];
  model.files!["review.poster.json"] = JSON.stringify(review);

  assert.ok(validatePosterModel(model, { stage: "review" }).some(({ code }) => code === "REVIEW_INVALID"));
});

test("review closure rejects boolean checks without evidence, anchors, and recovery", () => {
  const model = validPosterModel("review");
  const review = JSON.parse(String(model.files!["review.poster.json"]));
  review.checks.hierarchy = true;
  model.files!["review.poster.json"] = JSON.stringify(review);

  assert.ok(validatePosterModel(model, { stage: "review" }).some(({ code }) => code === "REVIEW_INVALID"));
});

test("probe requires current measured composition evidence", () => {
  const model = validPosterModel("probe");
  delete model.files!["evidence.composition.json"];

  assert.ok(validatePosterModel(model, { stage: "probe" }).some(({ code }) => code === "COMPOSITION_EVIDENCE_INVALID"));
});

test("composition evidence rejects polluted quiet regions", () => {
  const model = validPosterModel("probe");
  const evidence = JSON.parse(String(model.files!["evidence.composition.json"]));
  evidence.measurements[0].quietRegions[0].occupancy = 0.2;
  model.files!["evidence.composition.json"] = JSON.stringify(evidence);

  assert.ok(validatePosterModel(model, { stage: "probe" }).some(({ code }) => code === "COMPOSITION_EVIDENCE_INVALID"));
});

test("composition evidence rejects overlap when title and media are declared separate", () => {
  const model = validPosterModel("probe");
  const evidence = JSON.parse(String(model.files!["evidence.composition.json"]));
  evidence.measurements[0].titleMediaRelation.overlapRatio = 0.2;
  model.files!["evidence.composition.json"] = JSON.stringify(evidence);

  assert.ok(validatePosterModel(model, { stage: "probe" }).some(({ code }) => code === "COMPOSITION_EVIDENCE_INVALID"));
});

test("composition evidence rejects a front relation whose layer order does not match", () => {
  const model = validPosterModel("probe");
  const art = JSON.parse(String(model.files!["plan.art-direction.json"]));
  art.composition.titleMediaRelation = { depth: "title-front", mechanism: "mask" };
  model.files!["plan.art-direction.json"] = JSON.stringify(art);
  const subjectDigest = computePosterSubjectDigest(model);
  for (const path of ["evidence.probe.json", "evidence.accessibility.json", "evidence.composition.json"]) {
    const evidence = JSON.parse(String(model.files![path]));
    evidence.subjectDigest = subjectDigest;
    if (path === "evidence.composition.json") {
      evidence.measurements[0].titleMediaRelation = { depth: "title-front", mechanism: "mask", overlapRatio: 0.2, orderMatches: false };
    }
    model.files![path] = JSON.stringify(evidence);
  }

  assert.ok(validatePosterModel(model, { stage: "probe" }).some(({ code }) => code === "COMPOSITION_EVIDENCE_INVALID"));
});

test("skill composition rejects a substituted advisor", () => {
  const model = validPosterModel("source");
  const composition = JSON.parse(String(model.files!["plan.skill-composition.json"]));
  composition.workers[0].name = "lookalike-advisor";
  model.files!["plan.skill-composition.json"] = JSON.stringify(composition);
  assert.ok(validatePosterModel(model, { stage: "source" }).some(({ code }) => code === "SKILL_COMPOSITION_INVALID"));
});

test("denies generated poster writes but allows authored layer sources", () => {
  assert.equal(evaluatePosterWrite({ relativePath: "artifacts/poster/launch/dist/launch.main.png", toolName: "Write" }).decision, "deny");
  assert.equal(evaluatePosterWrite({ relativePath: "artifacts/poster/launch/src/variants/001-main/layers/001-background.a.png", toolName: "Write" }).decision, "deny");
  assert.deepEqual(evaluatePosterWrite({ relativePath: "artifacts/poster/launch/src/variants/001-main/layers/001-background.tsx", toolName: "apply_patch" }), { decision: "allow" });
});

test("denies generated writes when cwd is already the poster project", () => {
  const cwd = "/workspace/artifacts/poster/launch";
  assert.equal(evaluatePosterWrite({ relativePath: "dist/launch.main.png", toolName: "Write", cwd }).decision, "deny");
  assert.equal(evaluatePosterWrite({ relativePath: "src/variants/001-main/layers/001-background.abc.png", toolName: "Write", cwd }).decision, "deny");
  assert.equal(evaluatePosterWrite({ relativePath: "src/variants/001-main/layers/001-background-base.tsx", toolName: "Edit", cwd }).decision, "allow");
  assert.equal(evaluatePosterWrite({ relativePath: "../sibling/dist/sibling.main.png", toolName: "Write", cwd }).decision, "deny");
  assert.equal(evaluatePosterWrite({ relativePath: "../../../notes.txt", toolName: "Write", cwd }).decision, "allow");
});

test("review closure rejects self-review and stale subject evidence", () => {
  const previous = process.env.AI_EXPERTS_SESSION_ID;
  process.env.AI_EXPERTS_SESSION_ID = "review-session";
  try {
    assert.ok(validatePosterModel(validPosterModel("review"), { stage: "review" }).some(({ code }) => code === "REVIEW_SELF"));
  } finally {
    if (previous === undefined) delete process.env.AI_EXPERTS_SESSION_ID;
    else process.env.AI_EXPERTS_SESSION_ID = previous;
  }
  const stale = validPosterModel("review");
  const review = JSON.parse(String(stale.files!["review.poster.json"]));
  review.subjectDigest = "0".repeat(64);
  stale.files!["review.poster.json"] = JSON.stringify(review);
  assert.ok(validatePosterModel(stale, { stage: "review" }).some(({ code }) => code === "REVIEW_INVALID"));
});

test("release closure accepts current v3 evidence and receipt", () => {
  assert.deepEqual(validatePosterModel(validPosterModel("release"), { stage: "release" }), []);
});

test("release rejects empty accessibility evidence and manifest", () => {
  const model = validPosterModel("release");
  model.files!["evidence.accessibility.json"] = "{}\n";
  model.files!["release.manifest.json"] = "{}\n";
  const codes = new Set(validatePosterModel(model, { stage: "release" }).map(({ code }) => code));
  assert.ok(codes.has("ACCESSIBILITY_EVIDENCE_INVALID"));
  assert.ok(codes.has("RELEASE_MANIFEST_INVALID"));
});

test("receipt binds exact output bytes and current authored source", () => {
  const model = validPosterModel("review");
  model.files!["release.manifest.json"] = JSON.stringify({});
  model.files!["receipt.release.json"] = JSON.stringify(createPosterReceipt(model));
  assert.equal(validatePosterReceipt(model), true);
  model.files!["dist/launch-poster.main.png"] = makePng(320, 320, [17, 17, 17, 255]);
  assert.equal(validatePosterReceipt(model), false);
  model.files!["dist/launch-poster.main.png"] = makePng();
  model.files!["receipt.release.json"] = JSON.stringify(createPosterReceipt(model));
  const previousSubject = computePosterSubjectDigest(model);
  model.files!["src/theme.ts"] = `${String(model.files!["src/theme.ts"])}export const changed = true;\n`;
  assert.notEqual(computePosterSubjectDigest(model), previousSubject);
  assert.equal(validatePosterReceipt(model), false);
  assert.equal(sha256(makePng()), createPosterReceipt(validPosterModel("release")).outputs["dist/launch-poster.main.png"]);
});
