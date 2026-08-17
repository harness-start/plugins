import assert from "node:assert/strict";
import test from "node:test";

import {
  createPptxReceipt,
  evaluatePptxWrite,
  inspectPptxPackage,
  validatePptxModel,
  validatePptxReceipt,
} from "../src/lib/contract.js";
import { minimalPptx, releaseModel, sha256, sourceModel } from "./fixture.js";

test("accepts the strict source-stage project contract", () => {
  assert.deepEqual(validatePptxModel(sourceModel(), { stage: "source" }), []);
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
