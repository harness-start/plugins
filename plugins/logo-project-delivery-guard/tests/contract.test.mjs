import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createLogoReceipt,
  evaluateLogoWrite,
  extractSvgCircles,
  masterSubjectDigest,
  validateLogoModel,
  validateLogoReceipt,
  FIB_SEQUENCE,
} from "../scripts/lib/contract.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** Unit grid for Fibonacci circles: unit=4 → radii 12,20,32 for 3,5,8 (non-concentric joints) */
const UNIT = 4;
const C3 = { id: "c3", cx: 28, cy: 52, radiusUnits: 3 };
const C5 = { id: "c5", cx: 28, cy: 44, radiusUnits: 5 }; // dist to c3 = 8 = |20-12|
const C8 = { id: "c8", cx: 40, cy: 44, radiusUnits: 8 }; // dist to c5 = 12 = |32-20|

function formalFibonacci() {
  return {
    sequence: FIB_SEQUENCE,
    usage: "structural",
    unit: UNIT,
    tolerancePx: 1.5,
    toleranceRatio: 0.08,
    circles: [C3, C5, C8],
    spiral: {
      kind: "fibonacci-quarter-arcs",
      orderedCircleIds: ["c3", "c5", "c8"],
      arcs: [
        { circleId: "c3", startAngleDeg: 0, endAngleDeg: 90 },
        { circleId: "c5", startAngleDeg: 90, endAngleDeg: 180 },
        { circleId: "c8", startAngleDeg: 180, endAngleDeg: 270 },
      ],
    },
    pathBindings: [
      { pathId: "mark", role: "outline", circleId: "c8", feature: "center" },
      { pathId: "mark", role: "outline", circleId: "c8", feature: "rim" },
      { pathId: "mark", role: "negative-space", circleId: "c5", feature: "rim" },
    ],
    anchors: [{ kind: "outline" }, { kind: "outline" }, { kind: "negative-space" }],
  };
}

function markSvgFromCircles() {
  const parts = [C3, C5, C8].map((c) => {
    const r = c.radiusUnits * UNIT;
    return `<circle cx="${c.cx}" cy="${c.cy}" r="${r}" fill="none" stroke="#000"/>`;
  });
  // Rim sample points for path binding (on c8 circumference)
  const r8 = C8.radiusUnits * UNIT;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">${parts.join("")}<path d="M ${C8.cx} ${C8.cy - r8} L ${C8.cx + r8} ${C8.cy}" fill="none"/></svg>`;
}

function formalGeometry() {
  return {
    primitives: [
      { id: "c3", type: "circle", cx: C3.cx, cy: C3.cy, r: C3.radiusUnits * UNIT },
      { id: "c5", type: "circle", cx: C5.cx, cy: C5.cy, r: C5.radiusUnits * UNIT },
      { id: "c8", type: "circle", cx: C8.cx, cy: C8.cy, r: C8.radiusUnits * UNIT },
    ],
    constraints: [{ kind: "nested", a: "c3", b: "c5" }],
    pathMappings: [{ pathId: "mark", primitiveIds: ["c3", "c5", "c8"] }],
  };
}

function validModel() {
  const concept = "export function Concept() { return <svg viewBox='0 0 80 80'><circle cx='40' cy='40' r='32'/></svg>; }\n";
  const mark = markSvgFromCircles();
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
    "src/master/Mark.logo.tsx": `export function Mark(){return (${mark});}\n`,
    "src/master/Wordmark.logo.tsx": "export function Wordmark(){return <svg viewBox='0 0 200 100'><path d='M0 50 L200 50'/></svg>;}\n",
    "src/master/Lockup.logo.tsx": "export function Lockup(){return <svg viewBox='0 0 300 100'><path d='M0 0h300v100z'/></svg>;}\n",
    "src/construction/construction.json": JSON.stringify({ tolerance: 0.5, maxOpticalCorrection: 2 }),
    "src/construction/standard-grid.json": JSON.stringify({ unit: 8, clearSpace: 16, minimumPixels: 16 }),
    "src/construction/geometry.json": JSON.stringify(formalGeometry()),
    "src/construction/fibonacci.json": JSON.stringify(formalFibonacci()),
    "src/variants/manifest.json": JSON.stringify({ roles: ["mark", "wordmark", "lockup"], variants: ["primary", "mono", "reverse"] }),
    "build/master/mark.svg": mark,
    "build/master/wordmark.svg": "<svg viewBox='0 0 200 100'><path d='M0 50 L200 50'/></svg>",
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

function withReleaseEvidence(model) {
  const digest = masterSubjectDigest(model);
  const stripPath = `evidence/preview/strip.${digest}.png`;
  const stripBytes = "FAKE_STRIP_PNG_BYTES";
  model.files[stripPath] = stripBytes;
  const stripDigest = sha256(stripBytes);
  const samples = [
    { id: "black-16", row: "black", size: 16, locator: { bbox: [23, 228, 16, 16], region: "black 16px" } },
    { id: "black-32", row: "black", size: 32, locator: { bbox: [70, 212, 32, 32], region: "black 32px" } },
    { id: "black-64", row: "black", size: 64, locator: { bbox: [126, 180, 64, 64], region: "black 64px" } },
    { id: "reverse-16", row: "reverse", size: 16, locator: { bbox: [23, 366, 16, 16], region: "reverse 16px" } },
    { id: "reverse-32", row: "reverse", size: 32, locator: { bbox: [70, 350, 32, 32], region: "reverse 32px" } },
    { id: "reverse-64", row: "reverse", size: 64, locator: { bbox: [126, 318, 64, 64], region: "reverse 64px" } },
  ];
  model.files[`evidence/preview/strip.${digest}.manifest.json`] = JSON.stringify({
    masterDigest: digest,
    artifact: { sha256: stripDigest, kind: "image/png" },
    samples,
  });
  model.files[`evidence/preview/squint.${digest}.json`] = JSON.stringify({
    schemaVersion: 1,
    masterDigest: digest,
    stripDigest,
    method: "box-blur-threshold-connected-components",
    blurRadius: 2,
    pass: true,
    observation: "After box-blur low-pass, each 16/32/64 black and reverse cell keeps one dominant silhouette.",
    cells: samples.map((s) => ({
      id: s.id,
      row: s.row,
      size: s.size,
      bbox: s.locator.bbox,
      silhouetteIntact: true,
      density: 0.22,
      primaryShare: 0.9,
      componentCount: 1,
    })),
  });
  for (const variant of ["primary", "mono", "reverse"]) {
    for (const role of ["mark", "wordmark", "lockup"]) model.files[`dist/${variant}/${role}.svg`] = `${variant}-${role}`;
  }
  for (const role of ["mark", "wordmark", "lockup"]) model.files[`dist/primary/${role}.png`] = `png-${role}`;
  Object.assign(model.files, {
    "evidence.accessibility.json": "{}\n",
    "review.logo.json": JSON.stringify({
      masterDigest: digest,
      squintStripDigest: stripDigest,
      criteria: {
        singleMemoryPoint: { score: 2, requiredMin: 2, note: "one tip form spiral" },
        opticalCraft: { score: 2, requiredMin: 2, note: "quarter-arc joint construction" },
        markWordmarkSystem: { score: 2, requiredMin: 2, note: "shared stroke language" },
      },
    }),
    "release.manifest.json": "{}\n",
  });
  model.files["receipt.release.json"] = JSON.stringify(createLogoReceipt(model));
  return model;
}

test("rejects concentric Fibonacci spiral stacks", () => {
  const model = validModel();
  const fib = formalFibonacci();
  fib.circles = [
    { id: "c3", cx: 40, cy: 40, radiusUnits: 3 },
    { id: "c5", cx: 40, cy: 40, radiusUnits: 5 },
    { id: "c8", cx: 40, cy: 40, radiusUnits: 8 },
  ];
  model.files["src/construction/fibonacci.json"] = JSON.stringify(fib);
  const codes = validateLogoModel(model, { stage: "source" }).map(({ code }) => code);
  assert.ok(codes.includes("FIBONACCI_SPIRAL_CONCENTRIC") || codes.includes("FIBONACCI_SPIRAL_GEOMETRY_INVALID"));
});

test("rejects theater squint method", () => {
  const model = withReleaseEvidence(validModel());
  const digest = masterSubjectDigest(model);
  const path = `evidence/preview/squint.${digest}.json`;
  const squint = JSON.parse(model.files[path]);
  squint.method = "low-pass-proxy";
  model.files[path] = JSON.stringify(squint);
  model.files["receipt.release.json"] = JSON.stringify(createLogoReceipt(model));
  const codes = validateLogoModel(model, { stage: "release" }).map(({ code }) => code);
  assert.ok(codes.includes("SQUINT_METHOD_INVALID"));
});

test("accepts formal Fibonacci-circle construction bound to mark SVG", () => {
  assert.deepEqual(validateLogoModel(validModel(), { stage: "source" }), []);
});

test("rejects schema-only Fibonacci stubs without circles", () => {
  const model = validModel();
  model.files["src/construction/fibonacci.json"] = JSON.stringify({
    sequence: [1, 1, 2, 3, 5, 8, 13],
    usage: "structural",
    anchors: [{ kind: "outline" }, { kind: "outline" }, { kind: "negative-space" }],
  });
  const codes = validateLogoModel(model, { stage: "source" }).map(({ code }) => code);
  assert.ok(codes.includes("FIBONACCI_CIRCLES_MISSING"));
  assert.ok(codes.includes("FIBONACCI_UNIT_INVALID") || codes.includes("FIBONACCI_SPIRAL_INVALID"));
});

test("rejects Fibonacci circles not realized in mark master SVG", () => {
  const model = validModel();
  model.files["build/master/mark.svg"] = "<svg viewBox='0 0 80 80'><path d='M0 0h10v10z'/></svg>";
  // rebind construction sheets to new digest
  const digest = masterSubjectDigest(model);
  for (const sheet of ["standard", "geometry", "fibonacci"]) {
    model.files[`evidence/construction/${sheet}.${digest}.svg`] = "SVG";
    model.files[`evidence/construction/${sheet}.${digest}.png`] = "PNG";
  }
  const codes = validateLogoModel(model, { stage: "source" }).map(({ code }) => code);
  assert.ok(codes.includes("FIBONACCI_MARK_CIRCLE_UNREALIZED") || codes.includes("FIBONACCI_BINDING_RIM_MISS"));
});

test("rejects wrong radius units outside Fib sequence", () => {
  const model = validModel();
  const fib = formalFibonacci();
  fib.circles[0] = { id: "c7", cx: 40, cy: 40, radiusUnits: 7 };
  model.files["src/construction/fibonacci.json"] = JSON.stringify(fib);
  const codes = validateLogoModel(model, { stage: "source" }).map(({ code }) => code);
  assert.ok(codes.includes("FIBONACCI_RADIUS_NOT_IN_SEQUENCE"));
});

test("rejects decorative Fibonacci evidence and an invalid sequence", () => {
  const model = validModel();
  model.files["src/construction/fibonacci.json"] = JSON.stringify({ sequence: [1, 2, 3, 5, 8], usage: "decorative", anchors: [] });

  const codes = validateLogoModel(model, { stage: "source" }).map(({ code }) => code);

  assert.ok(codes.includes("FIBONACCI_SEQUENCE_INVALID"));
  assert.ok(codes.includes("FIBONACCI_USAGE_INVALID"));
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

test("release requires preview strip, squint evidence, and aesthetic scores", () => {
  const model = withReleaseEvidence(validModel());
  assert.deepEqual(validateLogoModel(model, { stage: "release" }), []);
  assert.equal(validateLogoReceipt(model), true);

  delete model.files[Object.keys(model.files).find((k) => k.startsWith("evidence/preview/squint."))];
  const codes = validateLogoModel(model, { stage: "release" }).map(({ code }) => code);
  assert.ok(codes.includes("PREVIEW_STRIP_MISSING") || codes.includes("SQUINT_MASTER_STALE") || codes.some((c) => c.startsWith("SQUINT_") || c === "REQUIRED_PATH_MISSING" || c === "PREVIEW_STRIP_MISSING" || c.includes("SQUINT")));
});

test("release fails when aesthetic score is below threshold", () => {
  const model = withReleaseEvidence(validModel());
  const digest = masterSubjectDigest(model);
  model.files["review.logo.json"] = JSON.stringify({
    masterDigest: digest,
    squintStripDigest: sha256(model.files[`evidence/preview/strip.${digest}.png`]),
    criteria: {
      singleMemoryPoint: { score: 0, requiredMin: 2 },
      opticalCraft: { score: 2, requiredMin: 2 },
      markWordmarkSystem: { score: 2, requiredMin: 2 },
    },
  });
  model.files["receipt.release.json"] = JSON.stringify(createLogoReceipt(model));
  const codes = validateLogoModel(model, { stage: "release" }).map(({ code }) => code);
  assert.ok(codes.includes("AESTHETIC_SCORE_BELOW_THRESHOLD"));
});

test("release fails when strip digest is stale relative to master", () => {
  const model = withReleaseEvidence(validModel());
  model.files["build/master/mark.svg"] += "<!-- touch -->";
  const codes = validateLogoModel(model, { stage: "release" }).map(({ code }) => code);
  assert.ok(codes.some((c) => c.includes("PREVIEW") || c.includes("SQUINT") || c.includes("REVIEW") || c.includes("CONSTRUCTION_SHEET")));
});

test("extractSvgCircles reads cx cy r", () => {
  const circles = extractSvgCircles(`<svg><circle cx="10" cy="20" r="5"/><circle cx='1' cy='2' r='3'></circle></svg>`);
  assert.equal(circles.length, 2);
  assert.deepEqual(circles[0], { cx: 10, cy: 20, r: 5 });
});
