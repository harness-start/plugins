import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

import {
  ASSET_PLAN_SCHEMA,
  BRIEF_SCHEMA,
  BRAND_CONTEXT_SCHEMA,
  CONCEPT_SELECTION_SCHEMA,
  DELIVERY_PROFILE_SCHEMA,
  EXTERNAL_SKILLS,
  INTEGRATION_PLAN_SCHEMA,
  RENDER_EVIDENCE_SCHEMA,
  REVIEW_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  computeLogoSubjectDigest,
  createConstructionManifest,
  createLogoReleaseManifest,
  createLogoReceipt,
  masterSubjectDigest,
  reviewArtifactPaths,
} from "../../src/lib/contract.js";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const RENDER_FIXTURE_SCRIPT = `import { cp, mkdir, readdir } from "node:fs/promises";\nimport { dirname, join, relative } from "node:path";\nconst source=process.env.LOGO_FIXTURE_SOURCE;\nconst allowed=(p)=>/^(?:build\\/|dist\\/|evidence\\/construction\\/|evidence\\.accessibility\\.json$|src\\/concepts\\/.+\\.[0-9a-f]{64}\\.png$)/u.test(p);\nasync function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const abs=join(dir,entry.name);if(entry.isDirectory())await walk(abs);else{const rel=relative(source,abs).replaceAll("\\\\","/");if(allowed(rel)){const target=join(process.cwd(),rel);await mkdir(dirname(target),{recursive:true});await cp(abs,target,{force:true});}}}}\nawait walk(source);\n`;

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

export function minimalPng(width = 1, height = 1, ink = true) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let row = 0; row < height; row += 1) rows[row * (width * 4 + 1)] = 0;
  if (ink) {
    const x = Math.floor(width / 2);
    const y = Math.floor(height / 2);
    rows[y * (width * 4 + 1) + 1 + x * 4 + 3] = 255;
  }
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
  const concepts = [
    ["symbolic-beacon", "symbolic", "A beacon abstracts guidance into one directional signal."],
    ["typographic-cut", "typographic", "A custom letter cut turns the name into proprietary form."],
    ["monogram-link", "monogram", "Interlocked initials express connection without extra symbols."],
    ["negative-space-path", "negative-space", "A hidden path creates a restrained discovery moment."],
    ["geometric-orbit", "geometric", "An orbital module expresses a stable connected system."],
    ["narrative-horizon", "narrative", "A horizon sequence tells a compact progress story."],
  ].map(([id, bucket, rationale], offset) => {
    const index = offset + 1;
    const source = `${String(index).padStart(3, "0")}-${id}.logo.tsx`;
    const code = `export function Concept(){return <svg viewBox="0 0 100 100"><circle cx="${20 + index * 5}" cy="50" r="${12 + index * 3}"/></svg>;}`;
    return { index, id, bucket, rationale, source, code };
  });
  const files = {
    ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
    "package.json": JSON.stringify({ scripts: { "logo:render": "node render-fixture.mjs" } }),
    "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "": {} } }),
    "plan.contract.json": JSON.stringify({ schema: "brand-logo-production/plan/v1", artifactId, targetStage: stage }),
    "plan.brief.json": JSON.stringify({ schema: BRIEF_SCHEMA, artifactId, audience: "brand customers", brandPositioning: "distinctive geometric identity", language: "en", constraints: ["native vector"], prohibitedDirections: ["generic template"], successCriteria: ["legible at 16px"] }),
    "plan.context.json": JSON.stringify({ schema: BRAND_CONTEXT_SCHEMA, artifactId, brandStory: "A connected service that guides customers through complex work.", market: "Professional B2B workflow software", differentiation: "One calm connected system instead of a fragmented tool stack.", competitors: ["generic suite", "point solution"], references: [{ id: "provided-brief", source: "workspace/README.md", provenance: "provided" }] }),
    "plan.skill-composition.json": JSON.stringify({
      schema: SKILL_COMPOSITION_SCHEMA,
      selectionPolicy: "dynamic-role-pool",
      workers: EXTERNAL_SKILLS.map((worker) => ({ ...worker, status: "skipped", reason: "fixture uses bundled contracts", advicePath: `evidence/skills/${worker.name}.json` })),
    }),
    "plan.assets.json": JSON.stringify({ schema: ASSET_PLAN_SCHEMA, artifactId, assets: [{ id: "brief", kind: "document", source: "workspace/README.md", provenance: "provided" }] }),
    "plan.concept-selection.json": JSON.stringify({ schema: CONCEPT_SELECTION_SCHEMA, artifactId, selectedConcept: "geometric-orbit", rounds: [{ round: 1, conceptIds: concepts.map(({ id }) => id), feedback: "Compare six distinct mechanisms in black and white against the frozen brief." }, { round: 2, conceptIds: ["geometric-orbit", "negative-space-path"], feedback: "Select the orbital system for stronger recognition and clearer product fit." }] }),
    "plan.delivery-profile.json": JSON.stringify({ schema: DELIVERY_PROFILE_SCHEMA, artifactId, transparentPngSizes: [64, 128, 256, 512], faviconSizes: [16, 32], secondaryLayout: "stacked", specimen: true, applicationMockup: true, print: { guidance: "CMYK-and-spot-color" } }),
    "plan.integration.json": JSON.stringify({ schema: INTEGRATION_PLAN_SCHEMA, artifactId, figma: { mode: "not-configured", fallback: "svg-import-package" } }),
    "logo.project.json": JSON.stringify({ schema: "brand-logo-production/project/v1", artifactId, selectedConcept: "geometric-orbit" }),
    "src/render.ts": "export const rendererContract = 'logo:render';\n",
    "render-fixture.mjs": RENDER_FIXTURE_SCRIPT,
    "src/concepts/manifest.json": JSON.stringify({ concepts: concepts.map(({ code: _code, ...entry }) => entry) }),
    "src/master/Mark.logo.tsx": component("Mark", 100),
    "src/master/Wordmark.logo.tsx": component("Wordmark", 200),
    "src/master/Lockup.logo.tsx": component("Lockup", 300),
    "src/construction/construction.json": JSON.stringify({ schema: "brand-logo-production/construction/v1", method: "fibonacci", rationale: "The orbital mark uses a verified Fibonacci circle construction after optical exploration.", tolerance: 0.5, maxOpticalCorrection: 2 }),
    "src/variants/manifest.json": JSON.stringify({ roles: ["mark", "wordmark", "lockup"], variants: ["primary", "mono", "reverse"] }),
    "build/master/mark.svg": vector("mark", 100),
    "build/master/wordmark.svg": vector("wordmark", 200),
    "build/master/lockup.svg": vector("lockup", 300),
  };
  for (const entry of concepts) {
    files[`src/concepts/${entry.source}`] = entry.code;
    files[`src/concepts/${entry.source.slice(0, -9)}.${sha256(entry.code)}.png`] = minimalPng(100, 100);
  }
  const model = { artifactId, files, plan: JSON.parse(files["plan.contract.json"]), project: JSON.parse(files["logo.project.json"]) };
  const masterDigest = masterSubjectDigest(model);
  files["src/construction/standard-grid.json"] = JSON.stringify({ schema: "brand-logo-production/standard-grid/v1", masterDigest, unit: 8, clearSpace: 16, minimumPixels: 16 });
  files["src/construction/geometry.json"] = JSON.stringify({
    schema: "brand-logo-production/geometry/v1",
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
    schema: "brand-logo-production/fibonacci/v1",
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
  files["dist/primary/lockup-stacked.svg"] = vector("lockup", 300);
  for (const size of [64, 128, 256, 512]) files[`dist/exports/mark-${size}.png`] = minimalPng(size, size);
  for (const size of [16, 32]) files[`dist/icons/favicon-${size}.png`] = minimalPng(size, size);
  files["dist/icons/app-icon-512.png"] = minimalPng(512, 512);
  files["dist/presentation/specimen.png"] = minimalPng(800, 600);
  files["dist/presentation/application-mockup.png"] = minimalPng(800, 600);
  files["dist/print/production-notes.json"] = JSON.stringify({ colorMode: "CMYK", conversionGuidance: "Convert from the approved sRGB master with a documented press profile and verify a physical proof.", spotColors: [] });
  files["dist/integration/figma-import.json"] = JSON.stringify({ mode: "svg-import-package", files: ["dist/primary/mark.svg", "dist/primary/wordmark.svg", "dist/primary/lockup.svg"] });
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
  files["evidence.render.json"] = JSON.stringify({
    schema: RENDER_EVIDENCE_SCHEMA,
    plugin: "brand-logo-production",
    artifactId,
    subjectDigest,
    sessionId: "logo-render-session",
    outputs: ["build/master/mark.svg", "build/master/wordmark.svg", "build/master/lockup.svg", "dist/primary/mark.svg"].map((path) => ({ path, sha256: sha256(files[path]) })),
  });
  files["evidence.accessibility.json"] = JSON.stringify({ schema: "brand-logo-production/accessibility/v1", artifactId, subjectDigest, checks: [{ id: "minimum-size", status: "pass" }, { id: "contrast", status: "pass" }] });
  files["review.logo.json"] = JSON.stringify({
    schema: REVIEW_SCHEMA,
    artifactId,
    subjectDigest,
    masterDigest,
    squintStripDigest: stripDigest,
    decision: "approved",
    reviewer: { kind: "independent-agent", id: "logo-reviewer", sessionId: "logo-review-session" },
    coverage: reviewArtifactPaths(model).map((path) => ({ path, sha256: sha256(files[path]) })),
    findings: [],
    checks: ["brief-fidelity", "concept-divergence", "vector-craft", "mono-reverse", "scene-application", "delivery-profile"].map((id) => ({ id, status: "pass" })),
    criteria: {
      structureConsistency: { score: 2, requiredMin: 2, note: "stable proportions across every role" },
      opticalCorrection: { score: 2, requiredMin: 2, note: "measured optical balance at target sizes" },
      singleMemoryPoint: { score: 2, requiredMin: 2, note: "single orbital silhouette" },
      semanticIntegration: { score: 2, requiredMin: 2, note: "connection meaning is integrated into the form" },
      markWordmarkSystem: { score: 2, requiredMin: 2, note: "shared geometric language" },
      restraint: { score: 2, requiredMin: 2, note: "one controlled gesture without decorative noise" },
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
