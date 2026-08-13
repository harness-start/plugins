import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  evaluatePptxWrite,
  validatePptxModel,
} from "../scripts/lib/contract.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function validModel() {
  const slide = [
    "export function renderSlide(slide, ctx) {",
    "  slide.addText(ctx.copy.title, { x: 1, y: 1, w: 8, h: 1 });",
    "}",
    "",
  ].join("\n");
  const digest = sha256(slide);

  return {
    artifactId: "quarterly-review",
    files: {
      ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
      "package.json": "{}\n",
      "package-lock.json": "{}\n",
      "plan.contract.json": "{}\n",
      "plan.storyboard.json": "{}\n",
      "pptx.project.json": "{}\n",
      "src/deck.ts": "const deck = new pptxgen();\ndeck.addSlide();\n",
      "src/theme.ts": "export const theme = {};\n",
      "src/slides/manifest.json": JSON.stringify({
        slides: [{ index: 1, id: "opening", source: "001-opening.ts" }],
      }),
      "src/slides/001-opening.ts": slide,
      [`src/slides/001-opening.${digest}.png`]: "PNG",
      "dist/quarterly-review.pptx": "PPTX",
      "dist/quarterly-review.pdf": "PDF",
      "dist/pages/001.png": "PNG",
      "evidence.structure.json": "{}\n",
      "evidence.accessibility.json": "{}\n",
      "review.pptx.json": `${JSON.stringify({ schema: "pptx-project-delivery-guard/review/v1", verdict: "pass", reviewer: { kind: "independent-agent", id: "reviewer-1", sessionId: "pptx-review-session" } })}\n`,
      "release.manifest.json": "{}\n",
      "receipt.release.json": "{}\n",
    },
    project: {
      artifactId: "quarterly-review",
      entry: "src/deck.ts",
      slideManifest: "src/slides/manifest.json",
      outputs: {
        pptx: "dist/quarterly-review.pptx",
        pdf: "dist/quarterly-review.pdf",
        pages: "dist/pages",
      },
    },
    tracked: [],
    ignored: [],
  };
}

test("accepts a contiguous one-module-per-slide model with a source-hash preview", () => {
  const findings = validatePptxModel(validModel(), { stage: "source" });

  assert.deepEqual(findings, []);
});

test("rejects artifact-local ignore rules that hide delivery evidence", () => {
  const model = validModel();
  model.files[".gitignore"] += "dist/\n*.png\n";

  const codes = validatePptxModel(model, { stage: "source" }).map(({ code }) => code);

  assert.deepEqual(codes, ["DELIVERY_PATH_IGNORED", "DELIVERY_PATH_IGNORED"]);
});

test("reports stable findings when a slide creates a page and lacks its hash preview", () => {
  const model = validModel();
  model.files["src/slides/001-opening.ts"] = [
    "export function renderSlide(slide, ctx) {",
    "  ctx.deck.addSlide();",
    "}",
    "",
  ].join("\n");

  const codes = validatePptxModel(model, { stage: "source" }).map(({ code }) => code);

  assert.deepEqual(codes, ["PREVIEW_MISSING", "SLIDE_OWNER_VIOLATION"]);
});

test("denies direct generated writes while allowing a slide source write", () => {
  assert.equal(
    evaluatePptxWrite({
      relativePath: "artifacts/pptx/quarterly-review/dist/quarterly-review.pptx",
      toolName: "Write",
    }).decision,
    "deny",
  );
  assert.equal(
    evaluatePptxWrite({
      relativePath: "artifacts/pptx/quarterly-review/src/slides/001-opening.abc.png",
      toolName: "apply_patch",
    }).decision,
    "deny",
  );
  assert.deepEqual(
    evaluatePptxWrite({
      relativePath: "artifacts/pptx/quarterly-review/src/slides/001-opening.ts",
      toolName: "apply_patch",
    }),
    { decision: "allow" },
  );
});

test("rejects a hand-written release receipt that is not bound to current sources and outputs", () => {
  const model = validModel();

  const codes = validatePptxModel(model, { stage: "release" }).map(({ code }) => code);

  assert.ok(codes.includes("RECEIPT_INVALID"));
});
