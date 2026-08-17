import assert from "node:assert/strict";
import test from "node:test";

import {
  BRIEF_SCHEMA,
  SKILL_ADVICE_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  createLogoReceipt,
  extractSvgCircles,
  FIB_SEQUENCE,
  masterSubjectDigest,
  validateLogoModel,
  validateLogoReceipt,
} from "../src/lib/contract.js";
import { minimalPng, validLogoModel } from "./helpers/logo-fixture.js";

test("accepts a semantically bound logo release", () => {
  assert.deepEqual(validateLogoModel(validLogoModel(), { stage: "release" }), []);
});

test("requires a decision-complete brief and the exact bilingual skill pool", () => {
  const model = validLogoModel({ stage: "source" });
  model.files["plan.brief.json"] = JSON.stringify({ schema: BRIEF_SCHEMA, artifactId: model.artifactId });
  model.files["plan.skill-composition.json"] = JSON.stringify({ schema: SKILL_COMPOSITION_SCHEMA, selectionPolicy: "anything", workers: [] });
  const codes = new Set(validateLogoModel(model, { stage: "source" }).map(({ code }) => code));
  assert.ok(codes.has("BRIEF_INVALID"));
  assert.ok(codes.has("SKILL_COMPOSITION_INVALID"));
});

test("limits active advisers to three and requires digest-bound advice evidence", () => {
  const model = validLogoModel({ stage: "source" });
  const composition = JSON.parse(String(model.files["plan.skill-composition.json"]));
  for (const worker of composition.workers) worker.status = "used";
  composition.workers.push({
    name: "overflow-adviser",
    ecosystem: "en",
    mode: "adviser",
    status: "used",
    reason: "exceeds the active-adviser cap",
    advicePath: "evidence/skills/overflow-adviser.json",
  });
  model.files["plan.skill-composition.json"] = JSON.stringify(composition);
  assert.ok(validateLogoModel(model, { stage: "source" }).some(({ code }) => code === "SKILL_COMPOSITION_ACTIVE_LIMIT"));

  composition.workers[3].status = "skipped";
  model.files["plan.skill-composition.json"] = JSON.stringify(composition);
  const used = composition.workers[0];
  model.files[used.advicePath] = JSON.stringify({ schema: SKILL_ADVICE_SCHEMA, skillName: used.name, subjectDigest: "0".repeat(64) });
  assert.ok(validateLogoModel(model, { stage: "source" }).some(({ code }) => code === "SKILL_ADVICE_INVALID"));
});

test("rejects an unselected or ambiguous concept manifest", () => {
  const model = validLogoModel();
  model.project.selectedConcept = "missing-concept";
  model.files["logo.project.json"] = JSON.stringify(model.project);
  const manifest = JSON.parse(model.files["src/concepts/manifest.json"]);
  manifest.concepts.push({ ...manifest.concepts[0], index: 2, source: "002-duplicate.logo.tsx" });
  model.files["src/concepts/002-duplicate.logo.tsx"] = model.files["src/concepts/001-geometric-orbit.logo.tsx"];
  model.files["src/concepts/manifest.json"] = JSON.stringify(manifest);

  assert.ok(validateLogoModel(model, { stage: "release" }).some(({ code }) => code === "CONCEPT_MANIFEST_INVALID"));
});

test("rejects a plan that does not bind artifact id and source|release stage", () => {
  const model = validLogoModel({ stage: "source" });
  model.files["plan.contract.json"] = JSON.stringify({ artifactId: "other", targetStage: "anything" });
  model.plan = JSON.parse(model.files["plan.contract.json"]);

  assert.ok(validateLogoModel(model, { stage: model.plan.targetStage }).some(({ code }) => code === "PLAN_CONTRACT_INVALID"));
});

test("rejects non-positive minimum size and unbound geometry or Fibonacci anchors", () => {
  const model = validLogoModel();
  const masterDigest = masterSubjectDigest(model);
  model.files["src/construction/standard-grid.json"] = JSON.stringify({ masterDigest, unit: 1, clearSpace: 1, minimumPixels: -999 });
  model.files["src/construction/geometry.json"] = JSON.stringify({ masterDigest, primitives: [{}], pathMappings: [{}] });
  model.files["src/construction/fibonacci.json"] = JSON.stringify({ masterDigest, sequence: FIB_SEQUENCE, usage: "structural", anchors: [{ kind: "outline" }, { kind: "outline" }, { kind: "turn" }] });

  const codes = new Set(validateLogoModel(model, { stage: "release" }).map(({ code }) => code));
  assert.ok(codes.has("STANDARD_GRID_INVALID"));
  assert.ok(codes.has("GEOMETRY_MAPPING_INVALID"));
  assert.ok(codes.has("FIBONACCI_ANCHORS_INVALID"));
  assert.ok(codes.has("FIBONACCI_CIRCLES_MISSING"));
});

test("rejects mappings to non-primitives, duplicate paths, and anchors bound to another path primitive", () => {
  const model = validLogoModel();
  const geometry = JSON.parse(model.files["src/construction/geometry.json"]);
  geometry.pathMappings[0].pathId = "mark-root";
  geometry.pathMappings.push({ role: "wordmark", pathId: "wordmark-shape", primitiveIds: ["wordmark-box"] });
  model.files["src/construction/geometry.json"] = JSON.stringify(geometry);

  const fibonacci = JSON.parse(model.files["src/construction/fibonacci.json"]);
  fibonacci.anchors[0].primitiveId = "lockup-box";
  model.files["src/construction/fibonacci.json"] = JSON.stringify(fibonacci);

  const codes = new Set(validateLogoModel(model, { stage: "release" }).map(({ code }) => code));
  assert.ok(codes.has("GEOMETRY_MAPPING_INVALID"));
  assert.ok(codes.has("FIBONACCI_ANCHORS_INVALID"));
});

test("rejects fake concept previews, construction sheets, and final SVG or PNG outputs", () => {
  const model = validLogoModel();
  const conceptPreview = Object.keys(model.files).find((filePath) => /^src\/concepts\/.+\.png$/u.test(filePath));
  model.files[conceptPreview] = Buffer.from("not a png");
  model.files[`evidence/construction/standard.${masterSubjectDigest(model)}.svg`] = "not an svg";
  model.files["dist/primary/mark.svg"] = "not an svg";
  model.files["dist/primary/mark.png"] = Buffer.from("not a png");

  const codes = new Set(validateLogoModel(model, { stage: "release" }).map(({ code }) => code));
  assert.ok(codes.has("CONCEPT_PREVIEW_INVALID"));
  assert.ok(codes.has("CONSTRUCTION_SHEET_INVALID"));
  assert.ok(codes.has("RELEASE_SVG_INVALID"));
  assert.ok(codes.has("RELEASE_PNG_INVALID"));
});

test("rejects a signature-only pseudo PNG without valid IDAT, CRC, and IEND", () => {
  const model = validLogoModel();
  const pseudo = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(pseudo, 0);
  pseudo.writeUInt32BE(13, 8);
  pseudo.write("IHDR", 12, "ascii");
  pseudo.writeUInt32BE(1, 16);
  pseudo.writeUInt32BE(1, 20);
  pseudo[24] = 8;
  pseudo[25] = 6;
  model.files["dist/primary/mark.png"] = pseudo;

  assert.ok(validateLogoModel(model, { stage: "release" }).some(({ code, path }) => code === "RELEASE_PNG_INVALID" && path === "dist/primary/mark.png"));
});

test("rejects incomplete variant, accessibility, review, and release manifest semantics", () => {
  const model = validLogoModel();
  model.files["src/variants/manifest.json"] = "{}";
  model.files["evidence.accessibility.json"] = "{}";
  model.files["review.logo.json"] = "{}";
  model.files["release.manifest.json"] = "{}";

  const codes = new Set(validateLogoModel(model, { stage: "release" }).map(({ code }) => code));
  assert.ok(codes.has("VARIANT_MANIFEST_INVALID"));
  assert.ok(codes.has("ACCESSIBILITY_EVIDENCE_INVALID"));
  assert.ok(codes.has("REVIEW_INVALID"));
  assert.ok(codes.has("RELEASE_MANIFEST_INVALID"));
});

test("rejects a release variant that hides or transforms otherwise matching master paths", () => {
  const model = validLogoModel();
  model.files["dist/mono/mark.svg"] = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><g transform=\"scale(0)\"><path id=\"mark-shape\" d=\"M10 10H90V90H10Z\"/></g></svg>";

  assert.ok(validateLogoModel(model, { stage: "release" }).some(({ code, path }) => ["RELEASE_SVG_INVALID", "RELEASE_GEOMETRY_MISMATCH"].includes(code) && path === "dist/mono/mark.svg"));
});

test("rejects malformed or non-renderable SVG geometry", () => {
  const malformed = validLogoModel();
  malformed.files["dist/primary/mark.svg"] = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><path id=\"mark-shape\" d=\"M10 10H90V90H10Z\"></svg>";
  assert.ok(validateLogoModel(malformed, { stage: "release" }).some(({ code, path }) => code === "RELEASE_SVG_INVALID" && path === "dist/primary/mark.svg"));

  const nonRenderable = validLogoModel();
  nonRenderable.files["build/master/mark.svg"] = '<svg viewBox="0 0 100 100"><path id="mark-shape" d="garbage"/></svg>';
  assert.ok(validateLogoModel(nonRenderable, { stage: "release" }).some(({ code }) => code === "MASTER_SVG_INVALID"));
});

test("release receipt invalidates when built master or construction evidence changes", () => {
  const model = validLogoModel();
  assert.equal(validateLogoReceipt(model), true);
  model.files["build/master/mark.svg"] = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 2 2\"><path id=\"mark-shape\" d=\"M0 0H2V2Z\"/></svg>";
  assert.equal(validateLogoReceipt(model), false);

  const restored = validLogoModel();
  const sheet = Object.keys(restored.files).find((filePath) => /^evidence\/construction\/standard\..+\.png$/u.test(filePath));
  restored.files[sheet] = minimalPng(2, 2);
  assert.equal(validateLogoReceipt(restored), false);
});

test("receipt cannot be self-issued over garbage outputs", () => {
  const model = validLogoModel();
  model.files["dist/primary/mark.svg"] = "garbage";
  model.files["receipt.release.json"] = JSON.stringify(createLogoReceipt(model));
  assert.ok(validateLogoModel(model, { stage: "release" }).some(({ code }) => code === "RELEASE_SVG_INVALID"));
});

test("rejects concentric or schema-only Fibonacci construction", () => {
  const concentric = validLogoModel({ stage: "source" });
  const fibonacci = JSON.parse(concentric.files["src/construction/fibonacci.json"]);
  fibonacci.circles = fibonacci.circles.map((circle) => ({ ...circle, cx: 40, cy: 40 }));
  concentric.files["src/construction/fibonacci.json"] = JSON.stringify(fibonacci);
  const concentricCodes = new Set(validateLogoModel(concentric, { stage: "source" }).map(({ code }) => code));
  assert.ok(concentricCodes.has("FIBONACCI_SPIRAL_CONCENTRIC") || concentricCodes.has("FIBONACCI_SPIRAL_GEOMETRY_INVALID"));

  const stub = validLogoModel({ stage: "source" });
  stub.files["src/construction/fibonacci.json"] = JSON.stringify({ schema: "brand-logo-production/fibonacci/v1", masterDigest: masterSubjectDigest(stub), sequence: FIB_SEQUENCE, usage: "structural", anchors: [] });
  const stubCodes = new Set(validateLogoModel(stub, { stage: "source" }).map(({ code }) => code));
  assert.ok(stubCodes.has("FIBONACCI_CIRCLES_MISSING"));
  assert.ok(stubCodes.has("FIBONACCI_SPIRAL_INVALID"));
});

test("rejects unrealized Fibonacci circles and radii outside the sequence", () => {
  const unrealized = validLogoModel({ stage: "source" });
  unrealized.files["build/master/mark.svg"] = '<svg viewBox="0 0 100 100"><path id="mark-shape" d="M0 0H10V10Z"/></svg>';
  const unrealizedCodes = new Set(validateLogoModel(unrealized, { stage: "source" }).map(({ code }) => code));
  assert.ok(unrealizedCodes.has("FIBONACCI_MARK_CIRCLE_UNREALIZED") || unrealizedCodes.has("FIBONACCI_BINDING_RIM_MISS"));

  const wrongRadius = validLogoModel({ stage: "source" });
  const fibonacci = JSON.parse(wrongRadius.files["src/construction/fibonacci.json"]);
  fibonacci.circles[0].radiusUnits = 7;
  wrongRadius.files["src/construction/fibonacci.json"] = JSON.stringify(fibonacci);
  assert.ok(validateLogoModel(wrongRadius, { stage: "source" }).some(({ code }) => code === "FIBONACCI_RADIUS_NOT_IN_SEQUENCE"));
});

test("release requires measured squint evidence and passing aesthetic scores", () => {
  const theater = validLogoModel();
  const digest = masterSubjectDigest(theater);
  const squintPath = `evidence/preview/squint.${digest}.json`;
  const squint = JSON.parse(theater.files[squintPath]);
  squint.method = "low-pass-proxy";
  theater.files[squintPath] = JSON.stringify(squint);
  theater.files["receipt.release.json"] = JSON.stringify(createLogoReceipt(theater));
  assert.ok(validateLogoModel(theater, { stage: "release" }).some(({ code }) => code === "SQUINT_METHOD_INVALID"));

  const missing = validLogoModel();
  delete missing.files[`evidence/preview/squint.${masterSubjectDigest(missing)}.json`];
  assert.ok(validateLogoModel(missing, { stage: "release" }).some(({ code }) => code === "REQUIRED_PATH_MISSING"));

  const lowScore = validLogoModel();
  const review = JSON.parse(lowScore.files["review.logo.json"]);
  review.criteria.singleMemoryPoint.score = 0;
  lowScore.files["review.logo.json"] = JSON.stringify(review);
  assert.ok(validateLogoModel(lowScore, { stage: "release" }).some(({ code }) => code === "AESTHETIC_SCORE_BELOW_THRESHOLD"));

  const loweredThreshold = validLogoModel();
  const thresholdReview = JSON.parse(loweredThreshold.files["review.logo.json"]);
  thresholdReview.criteria.singleMemoryPoint = { score: 0, requiredMin: 0, note: "threshold was improperly lowered" };
  loweredThreshold.files["review.logo.json"] = JSON.stringify(thresholdReview);
  assert.ok(validateLogoModel(loweredThreshold, { stage: "release" }).some(({ code }) => code === "AESTHETIC_SCORE_BELOW_THRESHOLD"));

  const forgedFinding = validLogoModel();
  const findingReview = JSON.parse(forgedFinding.files["review.logo.json"]);
  findingReview.findings.push({ findingId: "forged-001", severity: "minor", evidenceAnchor: "build/master/mark.svg", artifactDigest: "0".repeat(64), fix: "replace forged digest", status: "open", recheckEvidence: "" });
  forgedFinding.files["review.logo.json"] = JSON.stringify(findingReview);
  assert.ok(validateLogoModel(forgedFinding, { stage: "release" }).some(({ code }) => code === "REVIEW_FINDINGS_INVALID"));

  const missingReviewer = validLogoModel();
  const unsigned = JSON.parse(missingReviewer.files["review.logo.json"]);
  delete unsigned.reviewer;
  missingReviewer.files["review.logo.json"] = JSON.stringify(unsigned);
  assert.ok(validateLogoModel(missingReviewer, { stage: "release" }).some(({ code }) => code === "REVIEWER_INVALID"));

  const selfReview = validLogoModel();
  const self = JSON.parse(selfReview.files["review.logo.json"]);
  self.reviewer.sessionId = "unknown";
  selfReview.files["review.logo.json"] = JSON.stringify(self);
  assert.ok(validateLogoModel(selfReview, { stage: "release" }).some(({ code }) => code === "REVIEW_SELF"));
});

test("master changes stale preview bindings", () => {
  const model = validLogoModel();
  model.files["build/master/mark.svg"] = model.files["build/master/mark.svg"].replace("</svg>", '<circle cx="50" cy="50" r="1"/></svg>');
  const codes = validateLogoModel(model, { stage: "release" }).map(({ code }) => code);
  assert.ok(codes.some((code) => code.includes("PREVIEW") || code.includes("SQUINT") || code.includes("REVIEW") || code.includes("CONSTRUCTION")));
});

test("extractSvgCircles reads cx cy r", () => {
  const circles = extractSvgCircles(`<svg><circle cx="10" cy="20" r="5"/><circle cx='1' cy='2' r='3'></circle></svg>`);
  assert.equal(circles.length, 2);
  assert.deepEqual(circles[0], { cx: 10, cy: 20, r: 5 });
});
