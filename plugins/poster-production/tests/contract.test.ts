import assert from "node:assert/strict";
import test from "node:test";

import {
  computePosterSubjectDigest,
  createPosterReceipt,
  evaluatePosterWrite,
  posterForegroundMask,
  validatePosterModel,
  validatePosterReceipt,
} from "../src/lib/contract.js";
import { makePng, sha256, validPosterModel } from "./fixture.js";

test("accepts the complete v2 source contract", () => {
  assert.deepEqual(validatePosterModel(validPosterModel("source"), { stage: "source" }), []);
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
  design.typography.display.family = "Unregistered Display";
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

test("probe requires current measured composition evidence", () => {
  const model = validPosterModel("probe");
  delete model.files!["evidence.composition.json"];

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

test("release closure accepts current v2 evidence and receipt", () => {
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
