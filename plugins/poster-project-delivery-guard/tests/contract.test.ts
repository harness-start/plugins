import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  computePosterSubjectDigest,
  createPosterReceipt,
  evaluatePosterWrite,
  validatePosterReceipt,
  validatePosterModel,
} from "../src/lib/contract.js";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function minimalPng() {
  return Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da636000000200018ffd09d40000000049454e44ae426082",
    "hex",
  );
}

const MINIMAL_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1 1\"></svg>";

function validModel() {
  const layer = [
    "export function buildLayer(ctx) {",
    "  return <div style={{ display: 'flex' }}>{ctx.data.title}</div>;",
    "}",
    "",
  ].join("\n");
  const digest = sha256(layer);
  return {
    artifactId: "launch-poster",
    files: {
      ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
      "package.json": "{}\n",
      "package-lock.json": "{}\n",
      "plan.contract.json": "{}\n",
      "plan.assets.json": "{}\n",
      "poster.project.json": "{}\n",
      "src/render.ts": "export const render = () => {};\n",
      "src/compose.ts": "export const compose = () => {};\n",
      "src/theme.ts": "export const theme = {};\n",
      "src/variants/manifest.json": JSON.stringify({ variants: [{ index: 1, id: "main", directory: "001-main" }] }),
      "src/variants/001-main/variant.json": JSON.stringify({ id: "main", width: 1200, height: 1600 }),
      "src/variants/001-main/layers/manifest.json": JSON.stringify({ layers: [{ index: 1, role: "background", source: "001-background-base.tsx" }] }),
      "src/variants/001-main/layers/001-background-base.tsx": layer,
      [`src/variants/001-main/layers/001-background-base.${digest}.svg`]: MINIMAL_SVG,
      [`src/variants/001-main/layers/001-background-base.${digest}.png`]: minimalPng(),
      "data/001-main.json": "{}\n",
    },
    project: { artifactId: "launch-poster", variantManifest: "src/variants/manifest.json" },
  };
}

test("accepts an ordered variant and layer with paired source-hash proofs", () => {
  assert.deepEqual(validatePosterModel(validModel(), { stage: "source" }), []);
});

test("rejects stub proof bytes that are not a PNG or SVG", () => {
  const model = validModel();
  const digest = sha256(model.files["src/variants/001-main/layers/001-background-base.tsx"]);
  model.files[`src/variants/001-main/layers/001-background-base.${digest}.png`] = "PNG";
  model.files[`src/variants/001-main/layers/001-background-base.${digest}.svg`] = "SVG";
  const codes = new Set(validatePosterModel(model, { stage: "source" }).map(({ code }) => code));
  assert.ok(codes.has("LAYER_PROOF_INVALID"));
});

test("reports missing proof and forbidden zIndex through stable finding codes", () => {
  const model = validModel();
  const sourcePath = "src/variants/001-main/layers/001-background-base.tsx";
  model.files[sourcePath] = "export function buildLayer() { return <div style={{ zIndex: 2 }} />; }\n";

  const codes = validatePosterModel(model, { stage: "source" }).map(({ code }) => code);

  assert.deepEqual(codes, ["LAYER_OWNER_VIOLATION", "LAYER_PROOF_MISSING", "LAYER_PROOF_MISSING"]);
});

test("denies direct poster proof and dist writes but allows layer source", () => {
  assert.equal(evaluatePosterWrite({ relativePath: "artifacts/poster/launch/dist/launch.main.png", toolName: "Write" }).decision, "deny");
  assert.equal(evaluatePosterWrite({ relativePath: "artifacts/poster/launch/src/variants/001-main/layers/001-background.a.png", toolName: "Write" }).decision, "deny");
  assert.deepEqual(evaluatePosterWrite({ relativePath: "artifacts/poster/launch/src/variants/001-main/layers/001-background.tsx", toolName: "apply_patch" }), { decision: "allow" });
});

test("denies generated writes when cwd is the poster project directory", () => {
  const cwd = "/workspace/artifacts/poster/launch";
  assert.equal(
    evaluatePosterWrite({ relativePath: "dist/launch.main.png", toolName: "Write", cwd }).decision,
    "deny",
  );
  assert.equal(
    evaluatePosterWrite({
      relativePath: "src/variants/001-main/layers/001-background.abc.png",
      toolName: "Write",
      cwd,
    }).decision,
    "deny",
  );
  assert.equal(
    evaluatePosterWrite({
      relativePath: "src/variants/001-main/layers/001-background-base.tsx",
      toolName: "Edit",
      cwd,
    }).decision,
    "allow",
  );
});

function releaseFiles(model, extra = {}) {
  const subjectDigest = computePosterSubjectDigest(model);
  return {
    "dist/launch-poster.main.png": minimalPng(),
    "evidence.accessibility.json": `${JSON.stringify({
      schema: "poster-project-delivery-guard/accessibility/v1",
      artifactId: model.artifactId,
      subjectDigest,
      tool: "axe-core",
      verdict: "pass",
      checks: [{ id: "contrast", status: "pass" }],
    })}\n`,
    "review.poster.json": `${JSON.stringify({
      schema: "poster-project-delivery-guard/review/v1",
      verdict: "pass",
      reviewer: { kind: "independent-agent", id: "reviewer-1", sessionId: "poster-review-session" },
      subjectDigest,
      outputs: { "dist/launch-poster.main.png": sha256(minimalPng()) },
    })}\n`,
    "release.manifest.json": `${JSON.stringify({
      schema: "poster-project-delivery-guard/release-manifest/v1",
      artifactId: model.artifactId,
      subjectDigest,
      variants: [{ id: "main", output: "dist/launch-poster.main.png" }],
    })}\n`,
    ...extra,
  };
}

test("release rejects an empty or self-session poster review", () => {
  const model = validModel();
  Object.assign(model.files, {
    "dist/launch-poster.main.png": "FINAL",
    "evidence.accessibility.json": "{}\n",
    "review.poster.json": "{}\n",
    "release.manifest.json": "{}\n",
    "receipt.release.json": "{}\n",
  });
  assert.ok(validatePosterModel(model, { stage: "release" }).some(({ code }) => code === "REVIEW_INVALID"));

  model.files["review.poster.json"] = `${JSON.stringify({
    schema: "poster-project-delivery-guard/review/v1",
    verdict: "pass",
    reviewer: { kind: "independent-agent", id: "reviewer-1", sessionId: "unknown" },
  })}\n`;
  assert.ok(validatePosterModel(model, { stage: "release" }).some(({ code }) => code === "REVIEW_SELF"));
});

test("release rejects empty accessibility evidence and release manifest", () => {
  const model = validModel();
  Object.assign(model.files, releaseFiles(model, {
    "evidence.accessibility.json": "{}\n",
    "release.manifest.json": "{}\n",
  }));
  const codes = new Set(validatePosterModel(model, { stage: "release" }).map(({ code }) => code));
  assert.ok(codes.has("ACCESSIBILITY_EVIDENCE_INVALID"));
  assert.ok(codes.has("RELEASE_MANIFEST_INVALID"));
});

test("release rejects a review that does not bind the current subject digest", () => {
  const model = validModel();
  Object.assign(model.files, releaseFiles(model, {
    "review.poster.json": `${JSON.stringify({
      schema: "poster-project-delivery-guard/review/v1",
      verdict: "pass",
      reviewer: { kind: "independent-agent", id: "reviewer-1", sessionId: "poster-review-session" },
      subjectDigest: "0".repeat(64),
    })}\n`,
  }));
  assert.ok(validatePosterModel(model, { stage: "release" }).some(({ code }) => code === "REVIEW_SUBJECT_STALE"));
});

test("release receipt becomes stale after a poster source dependency changes", () => {
  const model = validModel();
  Object.assign(model.files, releaseFiles(model));
  const receipt = createPosterReceipt(model);
  model.files["receipt.release.json"] = JSON.stringify(receipt);

  assert.equal(receipt.outputs["dist/launch-poster.main.png"], sha256(minimalPng()));
  const proofPath = Object.keys(model.files).find((filePath) => filePath.endsWith(".png") && filePath.includes("001-background-base."));
  assert.equal(receipt.outputs[proofPath], sha256(minimalPng()));
  assert.equal(validatePosterReceipt(model), true);
  model.files[proofPath] = Buffer.from("SWAPPED-PNG");
  assert.equal(validatePosterReceipt(model), false);
  model.files[proofPath] = minimalPng();
  model.files["src/theme.ts"] += "export const changed = true;\n";
  assert.equal(validatePosterReceipt(model), false);
});
