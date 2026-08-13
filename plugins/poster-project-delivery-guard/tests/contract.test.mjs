import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createPosterReceipt,
  evaluatePosterWrite,
  validatePosterReceipt,
  validatePosterModel,
} from "../scripts/lib/contract.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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
      [`src/variants/001-main/layers/001-background-base.${digest}.svg`]: "SVG",
      [`src/variants/001-main/layers/001-background-base.${digest}.png`]: "PNG",
      "data/001-main.json": "{}\n",
    },
    project: { artifactId: "launch-poster", variantManifest: "src/variants/manifest.json" },
  };
}

test("accepts an ordered variant and layer with paired source-hash proofs", () => {
  assert.deepEqual(validatePosterModel(validModel(), { stage: "source" }), []);
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

test("release receipt becomes stale after a poster source dependency changes", () => {
  const model = validModel();
  Object.assign(model.files, {
    "dist/launch-poster.main.png": "FINAL",
    "evidence.accessibility.json": "{}\n",
    "review.poster.json": `${JSON.stringify({ schema: "poster-project-delivery-guard/review/v1", verdict: "pass", reviewer: { kind: "independent-agent", id: "reviewer-1", sessionId: "poster-review-session" } })}\n`,
    "release.manifest.json": "{}\n",
  });
  const receipt = createPosterReceipt(model);
  model.files["receipt.release.json"] = JSON.stringify(receipt);

  assert.equal(receipt.outputs["dist/launch-poster.main.png"], sha256("FINAL"));
  const proofPath = Object.keys(model.files).find((filePath) => filePath.endsWith(".png") && filePath.includes("001-background-base."));
  assert.equal(receipt.outputs[proofPath], sha256("PNG"));
  assert.equal(validatePosterReceipt(model), true);
  model.files[proofPath] = "SWAPPED-PNG";
  assert.equal(validatePosterReceipt(model), false);
  model.files[proofPath] = "PNG";
  model.files["src/theme.ts"] += "export const changed = true;\n";
  assert.equal(validatePosterReceipt(model), false);
});
