import assert from "node:assert/strict";
import test from "node:test";

import {
  createLogoReceipt,
  masterSubjectDigest,
  validateLogoModel,
  validateLogoReceipt,
} from "../scripts/lib/contract.mjs";
import { minimalPng, validLogoModel } from "./helpers/logo-fixture.mjs";

test("accepts a semantically bound logo release", () => {
  assert.deepEqual(validateLogoModel(validLogoModel(), { stage: "release" }), []);
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
  model.files["src/construction/fibonacci.json"] = JSON.stringify({ masterDigest, sequence: [1, 1, 2, 3, 5, 8, 13], usage: "structural", anchors: [{ kind: "outline" }, { kind: "outline" }, { kind: "turn" }] });

  const codes = new Set(validateLogoModel(model, { stage: "release" }).map(({ code }) => code));
  assert.ok(codes.has("STANDARD_GRID_INVALID"));
  assert.ok(codes.has("GEOMETRY_MAPPING_INVALID"));
  assert.ok(codes.has("FIBONACCI_ANCHORS_INVALID"));
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
  model.files["evidence/construction/standard." + masterSubjectDigest(model) + ".svg"] = "not an svg";
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

  const findings = validateLogoModel(model, { stage: "release" });
  assert.ok(findings.some(({ code, path }) => ["RELEASE_SVG_INVALID", "RELEASE_GEOMETRY_MISMATCH"].includes(code) && path === "dist/mono/mark.svg"));
});

test("rejects malformed SVG markup even when viewBox and path data look valid", () => {
  const model = validLogoModel();
  model.files["dist/primary/mark.svg"] = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><path id=\"mark-shape\" d=\"M10 10H90V90H10Z\"></svg>";

  assert.ok(validateLogoModel(model, { stage: "release" }).some(({ code, path }) => code === "RELEASE_SVG_INVALID" && path === "dist/primary/mark.svg"));
});

test("rejects well-formed SVG markup with non-renderable primitive geometry", () => {
  const model = validLogoModel();
  model.files["build/master/mark.svg"] = '<svg viewBox="0 0 100 100"><path id="mark-shape" d="garbage"/></svg>';

  assert.ok(validateLogoModel(model, { stage: "release" }).some(({ code }) => code === "MASTER_SVG_INVALID"));
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
