import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createLogoReceipt,
  evaluateLogoWrite,
  masterSubjectDigest,
  validateLogoModel,
  validateLogoReceipt,
} from "../scripts/lib/contract.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function validModel() {
  const concept = "export function Concept() { return <svg viewBox='0 0 100 100'><circle cx='50' cy='50' r='40'/></svg>; }\n";
  const files = {
    ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
    "package.json": "{}\n",
    "package-lock.json": "{}\n",
    "plan.contract.json": "{}\n",
    "plan.assets.json": "{}\n",
    "logo.project.json": "{}\n",
    "src/render.ts": "export const render = () => {};\n",
    "src/concepts/manifest.json": JSON.stringify({ concepts: [{ index: 1, id: "geometric-orbit", source: "001-geometric-orbit.logo.tsx" }] }),
    "src/concepts/001-geometric-orbit.logo.tsx": concept,
    [`src/concepts/001-geometric-orbit.${sha256(concept)}.png`]: "PNG",
    "src/master/Mark.logo.tsx": "export function Mark(){return <svg viewBox='0 0 100 100'><path d='M0 0h100v100z'/></svg>;}\n",
    "src/master/Wordmark.logo.tsx": "export function Wordmark(){return <svg viewBox='0 0 200 100'><path d='M0 0h200v100z'/></svg>;}\n",
    "src/master/Lockup.logo.tsx": "export function Lockup(){return <svg viewBox='0 0 300 100'><path d='M0 0h300v100z'/></svg>;}\n",
    "src/construction/construction.json": JSON.stringify({ tolerance: 0.5, maxOpticalCorrection: 2 }),
    "src/construction/standard-grid.json": JSON.stringify({ unit: 8, clearSpace: 16, minimumPixels: 16 }),
    "src/construction/geometry.json": JSON.stringify({ primitives: [{ id: "c1", type: "circle" }], constraints: [], pathMappings: [{ pathId: "mark", primitiveIds: ["c1"] }] }),
    "src/construction/fibonacci.json": JSON.stringify({ sequence: [1, 1, 2, 3, 5, 8, 13], usage: "structural", anchors: [{ kind: "outline" }, { kind: "outline" }, { kind: "negative-space" }] }),
    "src/variants/manifest.json": JSON.stringify({ roles: ["mark", "wordmark", "lockup"], variants: ["primary", "mono", "reverse"] }),
    "build/master/mark.svg": "<svg viewBox='0 0 100 100'><path d='M0 0h100v100z'/></svg>",
    "build/master/wordmark.svg": "<svg viewBox='0 0 200 100'><path d='M0 0h200v100z'/></svg>",
    "build/master/lockup.svg": "<svg viewBox='0 0 300 100'><path d='M0 0h300v100z'/></svg>",
  };
  const model = { artifactId: "orbit-logo", files, project: { artifactId: "orbit-logo", selectedConcept: "geometric-orbit" } };
  const digest = masterSubjectDigest(model);
  for (const sheet of ["standard", "geometry", "fibonacci"]) {
    files[`evidence/construction/${sheet}.${digest}.svg`] = "SVG";
    files[`evidence/construction/${sheet}.${digest}.png`] = "PNG";
  }
  return model;
}

test("accepts bound master roles and all three construction sheets", () => {
  assert.deepEqual(validateLogoModel(validModel(), { stage: "source" }), []);
});

test("rejects decorative Fibonacci evidence and an invalid sequence", () => {
  const model = validModel();
  model.files["src/construction/fibonacci.json"] = JSON.stringify({ sequence: [1, 2, 3, 5, 8], usage: "decorative", anchors: [] });

  const codes = validateLogoModel(model, { stage: "source" }).map(({ code }) => code);

  assert.deepEqual(codes, ["FIBONACCI_ANCHORS_INVALID", "FIBONACCI_SEQUENCE_INVALID", "FIBONACCI_USAGE_INVALID"]);
});

test("rejects raster content inside a master TSX role", () => {
  const model = validModel();
  model.files["src/master/Mark.logo.tsx"] = "export function Mark(){return <svg><image href='mark.png'/></svg>;}\n";

  assert.ok(validateLogoModel(model, { stage: "source" }).some(({ code }) => code === "MASTER_VECTOR_VIOLATION"));
});

test("denies direct construction and dist writes but allows master source", () => {
  assert.equal(evaluateLogoWrite({ relativePath: "artifacts/logo/orbit/evidence/construction/standard.abc.png", toolName: "Write" }).decision, "deny");
  assert.equal(evaluateLogoWrite({ relativePath: "artifacts/logo/orbit/dist/primary/mark.svg", toolName: "Write" }).decision, "deny");
  assert.deepEqual(evaluateLogoWrite({ relativePath: "artifacts/logo/orbit/src/master/Mark.logo.tsx", toolName: "apply_patch" }), { decision: "allow" });
});

test("release receipt binds the logo sources and full output matrix", () => {
  const model = validModel();
  for (const variant of ["primary", "mono", "reverse"]) {
    for (const role of ["mark", "wordmark", "lockup"]) model.files[`dist/${variant}/${role}.svg`] = `${variant}-${role}`;
  }
  for (const role of ["mark", "wordmark", "lockup"]) model.files[`dist/primary/${role}.png`] = `png-${role}`;
  Object.assign(model.files, {
    "evidence.accessibility.json": "{}\n",
    "review.logo.json": "{}\n",
    "release.manifest.json": "{}\n",
  });
  model.files["receipt.release.json"] = JSON.stringify(createLogoReceipt(model));

  assert.equal(validateLogoReceipt(model), true);
  model.files["src/master/Mark.logo.tsx"] += "export const changed = true;\n";
  assert.equal(validateLogoReceipt(model), false);
});
