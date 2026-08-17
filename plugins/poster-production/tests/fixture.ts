import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

import {
  ACCESSIBILITY_EVIDENCE_SCHEMA,
  ART_DIRECTION_SCHEMA,
  ASSET_MANIFEST_SCHEMA,
  COMPOSITION_EVIDENCE_SCHEMA,
  DESIGN_SYSTEM_SCHEMA,
  LAYER_MANIFEST_SCHEMA,
  PLAN_SCHEMA,
  PROBE_EVIDENCE_SCHEMA,
  PROJECT_SCHEMA,
  RENDER_EVIDENCE_SCHEMA,
  REVIEW_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  VARIANT_MANIFEST_SCHEMA,
  computePosterSubjectDigest,
  createPosterReceipt,
  createPosterReleaseManifest,
  type FileMap,
  type PosterModel,
  type PosterStage,
} from "../src/lib/contract.js";

export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type, "ascii");
  const output = Buffer.alloc(data.byteLength + 12);
  output.writeUInt32BE(data.byteLength, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.byteLength + 8);
  return output;
}

export function makePng(width = 320, height = 320, rgba: [number, number, number, number] = [244, 240, 232, 255]) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.alloc(width * 4 + 1);
  for (let offset = 1; offset < row.byteLength; offset += 4) row.set(rgba, offset);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function makeSvg(width = 320, height = 320) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#F4F0E8"/></svg>`;
}

export function validPosterModel(stage: PosterStage = "source"): PosterModel {
  const artifactId = "launch-poster";
  const layer = "export function buildLayer(ctx) { return <div style={{ display: 'flex' }}>{ctx.data.title}</div>; }\n";
  const layerDigest = sha256(layer);
  const png = makePng();
  const svg = makeSvg();
  const files: FileMap = {
    ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
    "package.json": "{}\n",
    "package-lock.json": "{}\n",
    "plan.contract.json": JSON.stringify({ schema: PLAN_SCHEMA, artifactId, profile: "editorial", targetStage: "release", audience: "digital readers", objective: "announce a public event", language: "zh-CN", assumptions: [] }),
    "plan.art-direction.json": JSON.stringify({ schema: ART_DIRECTION_SCHEMA, profile: "editorial", concept: "A type-led editorial announcement.", visualCenter: "One decisive event title.", hierarchy: "Title, date, supporting copy.", typographyStrategy: "Role-based scale and spacing.", colorRationale: "High-contrast restrained palette.", letterform: { typeClass: "geometric sans", strokeProfile: "uniform", structure: "stable horizontal gravity", edgeFinish: "clean vector", sceneReference: "public event editorial title" }, composition: { dominantAxis: "asymmetric-grid", focalRelationship: "title anchors the lower field", massToVoidTarget: { min: 0, max: 0.4 }, titleMediaRelation: "separate" }, negativeRules: ["pseudo-text", "decorative-metadata"] }),
    "plan.skill-composition.json": JSON.stringify({ schema: SKILL_COMPOSITION_SCHEMA, workers: [
      { name: "poster-regional-culture", status: "skipped" },
      { name: "poster-mondo", status: "skipped" },
      { name: "poster-academic", status: "skipped" },
      { name: "poster-visual-critique", status: "skipped" },
    ] }),
    "plan.assets.json": JSON.stringify({ schema: ASSET_MANIFEST_SCHEMA, assets: [] }),
    "design.system.json": JSON.stringify({ schema: DESIGN_SYSTEM_SCHEMA, colors: { canvas: "F4F0E8", textPrimary: "111111" }, typography: { display: { family: "Noto Sans SC", sizePx: 72, weight: 700, lineHeightPx: 80, letterSpacingEm: 0, maxWidthPx: 280, maxLines: 2, scriptPolicy: "mixed" } }, fontRegistry: [{ family: "Noto Sans SC", package: "@fontsource/noto-sans-sc", files: [{ path: "noto-sans-sc-latin-700-normal.woff", weight: 700, script: "latin" }, { path: "noto-sans-sc-chinese-simplified-700-normal.woff", weight: 700, script: "cjk" }] }], spacing: { safeAreaPx: 24, baseUnitPx: 8, paragraphGapPx: 16 }, contrastPairs: [{ foreground: "textPrimary", background: "canvas", minimum: 4.5 }] }),
    "poster.project.json": JSON.stringify({ schema: PROJECT_SCHEMA, artifactId, profile: "editorial", entry: "src/render.ts", variantManifest: "src/variants/manifest.json" }),
    "src/render.ts": "export const fonts = theme.fontRegistry;\nexport const render = () => {};\n",
    "src/compose.ts": "export const compose = () => {};\n",
    "src/theme.ts": "export const theme = {};\n",
    "src/variants/manifest.json": JSON.stringify({ schema: VARIANT_MANIFEST_SCHEMA, variants: [{ index: 1, id: "main", directory: "001-main", width: 320, height: 320 }] }),
    "src/variants/001-main/variant.json": JSON.stringify({ schema: "poster-production/variant/v2", id: "main", width: 320, height: 320, data: "data/main.json" }),
    "src/variants/001-main/layers/manifest.json": JSON.stringify({ schema: LAYER_MANIFEST_SCHEMA, layers: [{ index: 1, role: "background", source: "001-background-base.tsx" }] }),
    "src/variants/001-main/layers/001-background-base.tsx": layer,
    "data/main.json": JSON.stringify({ title: "Launch" }),
  };
  const model: PosterModel = { artifactId, files };
  if (["render", "probe", "review", "release"].includes(stage)) {
    files["dist/launch-poster.main.svg"] = svg;
    files["dist/launch-poster.main.png"] = png;
    files[`evidence/layers/main/001-background-base.${layerDigest}.svg`] = svg;
    files[`evidence/layers/main/001-background-base.${layerDigest}.png`] = png;
    const outputs = Object.keys(files).filter((path) => /^dist\/.+\.(?:svg|png)$|^evidence\/layers\/.+\.(?:svg|png)$/u.test(path)).sort().map((path) => ({ path, sha256: sha256(files[path] as string | Buffer) }));
    files["evidence.render.json"] = JSON.stringify({ schema: RENDER_EVIDENCE_SCHEMA, plugin: "poster-production", artifactId, subjectDigest: computePosterSubjectDigest(model), verdict: "pass", sessionId: "render-session", renderer: { satori: "0.29.0", resvg: "2.6.2" }, outputs });
  }
  if (["probe", "review", "release"].includes(stage)) {
    const subjectDigest = computePosterSubjectDigest(model);
    files["evidence.probe.json"] = JSON.stringify({ schema: PROBE_EVIDENCE_SCHEMA, plugin: "poster-production", artifactId, subjectDigest, verdict: "pass", measurements: [{ id: "main", svg: { width: 320, height: 320, viewBox: [0, 0, 320, 320] }, png: { width: 320, height: 320, alphaCoverage: 1 }, svgSha256: sha256(svg), pngSha256: sha256(png), independentRasterSha256: sha256(png) }], checks: [{ criterion: "svg-png-byte-equivalence", status: "pass" }, { criterion: "bounded-nonblank-raster", status: "pass" }] });
    files["evidence.accessibility.json"] = JSON.stringify({ schema: ACCESSIBILITY_EVIDENCE_SCHEMA, plugin: "poster-production", artifactId, subjectDigest, verdict: "pass", nonColorEncoding: true, checks: [{ criterion: "contrast:textPrimary:canvas", status: "pass", value: 17.1, minimum: 4.5 }, { role: "display", status: "pass", sizePx: 72 }] });
    files["evidence.composition.json"] = JSON.stringify({ schema: COMPOSITION_EVIDENCE_SCHEMA, plugin: "poster-production", artifactId, subjectDigest, verdict: "pass", measurements: [{ id: "main", foregroundCoverage: 0, voidCoverage: 1, titleMediaRelation: "separate", overlapRatio: 0, status: "pass" }] });
  }
  if (["review", "release"].includes(stage)) {
    files["review.poster.json"] = JSON.stringify({ schema: REVIEW_SCHEMA, plugin: "poster-production", artifactId, subjectDigest: computePosterSubjectDigest(model), verdict: "pass", reviewer: { kind: "independent-agent", id: "reviewer-1", sessionId: "review-session" }, variants: [{ id: "main", pngSha256: sha256(png), verdict: "pass" }], checks: { hierarchy: "pass", typography: "pass", composition: "pass", legibility: "pass", clipping: "pass", color: "pass", copy: "pass", profileFidelity: "pass", assetIntegrity: "pass" }, findings: [] });
  }
  if (stage === "release") {
    files["release.manifest.json"] = JSON.stringify(createPosterReleaseManifest(model));
    files["receipt.release.json"] = JSON.stringify(createPosterReceipt(model));
  }
  return model;
}
