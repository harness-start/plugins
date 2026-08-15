import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

import {
  computeLogoSubjectDigest,
  createConstructionManifest,
  createLogoReleaseManifest,
  createLogoReceipt,
  masterSubjectDigest,
} from "../../src/lib/contract.js";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const RENDER_FIXTURE_SCRIPT = `import { cp, readdir } from "node:fs/promises";\nimport { join } from "node:path";\nconst source=process.env.LOGO_FIXTURE_SOURCE;\nfor(const entry of await readdir(source)){if(entry!=="receipt.release.json")await cp(join(source,entry),join(process.cwd(),entry),{recursive:true,force:true});}\n`;

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.byteLength);
  chunk.writeUInt32BE(data.byteLength, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.byteLength);
  return chunk;
}

export function minimalPng(width = 1, height = 1) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let row = 0; row < height; row += 1) rows[row * (width * 4 + 1)] = 0;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND"),
  ]);
}

function vector(role, width) {
  const id = `${role}-shape`;
  const construction = role === "mark"
    ? '<circle id="c3" cx="10" cy="10" r="6"/><circle id="c5" cx="14" cy="10" r="10"/><circle id="c8" cx="20" cy="10" r="16"/>'
    : "";
  return `<svg id="${role}-root" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 100"><path id="${id}" d="M10 10H${width - 10}V90H10Z"/>${construction}</svg>`;
}

function component(role, width) {
  return `export function ${role}(){return <svg viewBox="0 0 ${width} 100"><path id="${role.toLowerCase()}-shape" d="M10 10H${width - 10}V90H10Z"/></svg>;}`;
}

export function validLogoModel({ artifactId = "orbit-logo", stage = "release" } = {}) {
  const concept = "export function Concept(){return <svg viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"40\"/></svg>;}";
  const files = {
    ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
    "package.json": JSON.stringify({ scripts: { "logo:render": "node render-fixture.mjs" } }),
    "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "": {} } }),
    "plan.contract.json": JSON.stringify({ schema: "logo-project-delivery-guard/plan/v1", artifactId, targetStage: stage }),
    "plan.assets.json": JSON.stringify({ assets: [] }),
    "logo.project.json": JSON.stringify({ schema: "logo-project-delivery-guard/project/v1", artifactId, selectedConcept: "geometric-orbit" }),
    "src/render.ts": "export const rendererContract = 'logo:render';\n",
    "render-fixture.mjs": RENDER_FIXTURE_SCRIPT,
    "src/concepts/manifest.json": JSON.stringify({ concepts: [{ index: 1, id: "geometric-orbit", source: "001-geometric-orbit.logo.tsx" }] }),
    "src/concepts/001-geometric-orbit.logo.tsx": concept,
    [`src/concepts/001-geometric-orbit.${sha256(concept)}.png`]: minimalPng(100, 100),
    "src/master/Mark.logo.tsx": component("Mark", 100),
    "src/master/Wordmark.logo.tsx": component("Wordmark", 200),
    "src/master/Lockup.logo.tsx": component("Lockup", 300),
    "src/construction/construction.json": JSON.stringify({ schema: "logo-project-delivery-guard/construction/v1", tolerance: 0.5, maxOpticalCorrection: 2 }),
    "src/variants/manifest.json": JSON.stringify({ roles: ["mark", "wordmark", "lockup"], variants: ["primary", "mono", "reverse"] }),
    "build/master/mark.svg": vector("mark", 100),
    "build/master/wordmark.svg": vector("wordmark", 200),
    "build/master/lockup.svg": vector("lockup", 300),
  };
  const model = { artifactId, files, plan: JSON.parse(files["plan.contract.json"]), project: JSON.parse(files["logo.project.json"]) };
  const masterDigest = masterSubjectDigest(model);
  files["src/construction/standard-grid.json"] = JSON.stringify({ schema: "logo-project-delivery-guard/standard-grid/v1", masterDigest, unit: 8, clearSpace: 16, minimumPixels: 16 });
  files["src/construction/geometry.json"] = JSON.stringify({
    schema: "logo-project-delivery-guard/geometry/v1",
    masterDigest,
    primitives: [
      { id: "mark-box", type: "rect", parameters: { x: 10, y: 10, width: 80, height: 80 } },
      { id: "wordmark-box", type: "rect", parameters: { x: 10, y: 10, width: 180, height: 80 } },
      { id: "lockup-box", type: "rect", parameters: { x: 10, y: 10, width: 280, height: 80 } },
      { id: "c3", type: "circle", parameters: { cx: 10, cy: 10, r: 6 } },
      { id: "c5", type: "circle", parameters: { cx: 14, cy: 10, r: 10 } },
      { id: "c8", type: "circle", parameters: { cx: 20, cy: 10, r: 16 } },
    ],
    pathMappings: [
      { role: "mark", pathId: "mark-shape", primitiveIds: ["mark-box"] },
      { role: "wordmark", pathId: "wordmark-shape", primitiveIds: ["wordmark-box"] },
      { role: "lockup", pathId: "lockup-shape", primitiveIds: ["lockup-box"] },
    ],
  });
  files["src/construction/fibonacci.json"] = JSON.stringify({
    schema: "logo-project-delivery-guard/fibonacci/v1",
    masterDigest,
    sequence: [1, 1, 2, 3, 5, 8, 13],
    usage: "structural",
    unit: 2,
    tolerancePx: 1.5,
    toleranceRatio: 0.08,
    circles: [
      { id: "c3", cx: 10, cy: 10, radiusUnits: 3 },
      { id: "c5", cx: 14, cy: 10, radiusUnits: 5 },
      { id: "c8", cx: 20, cy: 10, radiusUnits: 8 },
    ],
    spiral: { kind: "fibonacci-quarter-arcs", orderedCircleIds: ["c3", "c5", "c8"] },
    pathBindings: [
      { pathId: "mark-shape", role: "outline", circleId: "c3", feature: "center" },
      { pathId: "mark-shape", role: "outline", circleId: "c5", feature: "rim" },
      { pathId: "mark-shape", role: "turn", circleId: "c8", feature: "rim" },
    ],
    anchors: [
      { id: "mark-outline-a", role: "mark", pathId: "mark-shape", primitiveId: "mark-box", kind: "outline", x: 10, y: 10, sequenceValue: 5 },
      { id: "mark-outline-b", role: "mark", pathId: "mark-shape", primitiveId: "mark-box", kind: "outline", x: 90, y: 90, sequenceValue: 8 },
      { id: "mark-turn", role: "mark", pathId: "mark-shape", primitiveId: "mark-box", kind: "turn", x: 90, y: 10, sequenceValue: 3 },
    ],
  });
  for (const sheet of ["standard", "geometry", "fibonacci"]) {
    files[`evidence/construction/${sheet}.${masterDigest}.svg`] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-construction-sheet="${sheet}" data-master-digest="${masterDigest}"><path id="${sheet}-proof" d="M0 0H100V100H0Z"/></svg>`;
    files[`evidence/construction/${sheet}.${masterDigest}.png`] = minimalPng(100, 100);
  }
  files[`evidence/construction/manifest.${masterDigest}.json`] = JSON.stringify(createConstructionManifest(model));
  for (const variant of ["primary", "mono", "reverse"]) {
    for (const [role, width] of [["mark", 100], ["wordmark", 200], ["lockup", 300]]) files[`dist/${variant}/${role}.svg`] = vector(role, width);
  }
  for (const role of ["mark", "wordmark", "lockup"]) files[`dist/primary/${role}.png`] = minimalPng(100, 100);
  const stripPath = `evidence/preview/strip.${masterDigest}.png`;
  const stripManifestPath = `evidence/preview/strip.${masterDigest}.manifest.json`;
  const squintPath = `evidence/preview/squint.${masterDigest}.json`;
  const strip = minimalPng(256, 256);
  const stripDigest = sha256(strip);
  const samples = [
    { id: "black-16", row: "black", size: 16, locator: { bbox: [8, 8, 16, 16] } },
    { id: "black-32", row: "black", size: 32, locator: { bbox: [32, 8, 32, 32] } },
    { id: "black-64", row: "black", size: 64, locator: { bbox: [72, 8, 64, 64] } },
    { id: "reverse-16", row: "reverse", size: 16, locator: { bbox: [8, 96, 16, 16] } },
    { id: "reverse-32", row: "reverse", size: 32, locator: { bbox: [32, 96, 32, 32] } },
    { id: "reverse-64", row: "reverse", size: 64, locator: { bbox: [72, 96, 64, 64] } },
  ];
  files[stripPath] = strip;
  files[stripManifestPath] = JSON.stringify({ masterDigest, artifact: { sha256: stripDigest, kind: "image/png" }, samples });
  files[squintPath] = JSON.stringify({
    schemaVersion: 1,
    masterDigest,
    stripDigest,
    method: "box-blur-threshold-connected-components",
    pass: true,
    observation: "Measured blur retains one dominant silhouette for every black and reverse sample.",
    cells: samples.map((sample) => ({ ...sample, bbox: sample.locator.bbox, silhouetteIntact: true, density: 0.25, primaryShare: 0.9 })),
  });
  const subjectDigest = computeLogoSubjectDigest(model);
  files["evidence.accessibility.json"] = JSON.stringify({ schema: "logo-project-delivery-guard/accessibility/v1", artifactId, subjectDigest, checks: [{ id: "minimum-size", status: "pass" }, { id: "contrast", status: "pass" }] });
  files["review.logo.json"] = JSON.stringify({
    schema: "logo-project-delivery-guard/review/v1",
    artifactId,
    subjectDigest,
    masterDigest,
    squintStripDigest: stripDigest,
    decision: "approved",
    reviewer: { kind: "independent-agent", id: "logo-reviewer", sessionId: "logo-review-session" },
    checks: [{ id: "geometry", status: "pass" }, { id: "legibility", status: "pass" }, { id: "variants", status: "pass" }],
    criteria: {
      singleMemoryPoint: { score: 2, requiredMin: 2, note: "single orbital silhouette" },
      opticalCraft: { score: 2, requiredMin: 2, note: "measured optical balance" },
      markWordmarkSystem: { score: 2, requiredMin: 2, note: "shared geometric language" },
    },
  });
  files["release.manifest.json"] = JSON.stringify(createLogoReleaseManifest(model));
  files["receipt.release.json"] = JSON.stringify(createLogoReceipt(model));
  return model;
}

export function isGeneratedPath(filePath) {
  return /^(?:build\/|dist\/|evidence(?:\.|\/)|review\.logo\.json$|release\.manifest\.json$|receipt\.|src\/concepts\/.+\.[0-9a-f]{64}\.png$)/u.test(filePath);
}

export async function writeModel(root, model, { generated = "all" } = {}) {
  for (const [filePath, value] of Object.entries(model.files)) {
    if (generated === "none" && isGeneratedPath(filePath)) continue;
    if (generated === "only" && !isGeneratedPath(filePath)) continue;
    const absolute = join(root, filePath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, value);
  }
}
