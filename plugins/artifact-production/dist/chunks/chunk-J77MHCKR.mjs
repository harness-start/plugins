// harness-source-hash: sha256:0c811d66170e751d4c95f49bfca01deb84cbe9025b35ec552ae2ab9dd9de90a7
import {
  require_lib
} from "./chunk-RIYLCIXM.mjs";
import {
  communicationAnchors,
  communicationCoreValid,
  communicationReviewValid
} from "./chunk-DL3TI7GO.mjs";
import {
  __toESM
} from "./chunk-4DTUINPK.mjs";

// plugins/artifact-production/src/domains/poster/lib/contract.ts
var import_xmldom = __toESM(require_lib(), 1);
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { inflateSync } from "node:zlib";
var POSTER_PROFILES = [
  "regional-culture",
  "mondo",
  "editorial",
  "academic",
  "custom"
];
var POSTER_STAGES = [
  "source",
  "design",
  "render",
  "probe",
  "review",
  "release"
];
var PLAN_SCHEMA = "poster-production/plan/v2";
var ART_DIRECTION_SCHEMA = "poster-production/art-direction/v4";
var SKILL_COMPOSITION_SCHEMA = "poster-production/skill-composition/v1";
var ASSET_MANIFEST_SCHEMA = "poster-production/assets/v2";
var DESIGN_SYSTEM_SCHEMA = "poster-production/design-system/v3";
var PROJECT_SCHEMA = "poster-production/project/v2";
var VARIANT_MANIFEST_SCHEMA = "poster-production/variant-manifest/v3";
var LAYER_MANIFEST_SCHEMA = "poster-production/layer-manifest/v3";
var RENDER_EVIDENCE_SCHEMA = "poster-production/render/v1";
var PROBE_EVIDENCE_SCHEMA = "poster-production/probe/v1";
var ACCESSIBILITY_EVIDENCE_SCHEMA = "poster-production/accessibility/v3";
var COMPOSITION_EVIDENCE_SCHEMA = "poster-production/composition/v2";
var REVIEW_INPUT_SCHEMA = "poster-production/review-input/v4";
var REVIEW_SCHEMA = "poster-production/review/v4";
var RELEASE_MANIFEST_SCHEMA = "poster-production/release-manifest/v2";
var STAGE_RANK = {
  source: 0,
  design: 1,
  render: 2,
  probe: 3,
  review: 4,
  release: 5
};
var PROFILE_SET = new Set(POSTER_PROFILES);
var STAGE_SET = new Set(POSTER_STAGES);
var VARIANT_DIRECTORY = /^(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)$/u;
var LAYER_SOURCE = /^(?<index>[0-9]{3})-(?<role>background|media|overlay|decoration|title|body|metadata|brand|cta)-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.tsx$/u;
var OWNER_VIOLATION = /(?:\bzIndex\s*:|from\s+["'](?:satori|@resvg\/resvg-js|node:|fs|child_process|http|https|net|tls|dns)|\b(?:import|require|fetch|setTimeout|setInterval)\s*\(|\b(?:process|globalThis|performance|crypto)\.|\b(?:Date\.now|Math\.random)\s*\(|\bnew\s+Date\b|\b(?:useState|useEffect|useLayoutEffect)\s*\(|<\s*(?:script|style|link|iframe)\b|https?:\/\/)/u;
var GENERATED_PATH = /^(?:dist\/|evidence(?:\.|\/)|review\.poster\.json$|release\.manifest\.json$|receipt\.release\.json$|\.poster-delivery-journal\.json$|\.tmp\/poster-guard\/)/u;
var SUBJECT_EXCLUDED_PATH = /^(?:dist\/|evidence(?:\.|\/)|review\.poster\.json$|release\.manifest\.json$|receipt\.release\.json$|\.poster-delivery-journal\.json$|\.tmp\/)/u;
var SOURCE_PROOF = /^src\/variants\/.+\.[0-9a-f]{64}\.(?:png|svg)$/u;
var SOURCE_PROOF_PATH = /^src\/variants\/.+\.(?:png|svg)$/u;
var REQUIRED_SOURCE_FILES = [
  ".gitignore",
  "package.json",
  "package-lock.json",
  "src/render.ts",
  "src/compose.ts",
  "src/theme.ts"
];
var REQUIRED_ADVISORS = /* @__PURE__ */ new Set([
  "poster-regional-culture",
  "poster-mondo",
  "poster-academic",
  "poster-visual-critique"
]);
var REVIEW_CHECKS = [
  "hierarchy",
  "typography",
  "scriptTypography",
  "composition",
  "negativeSpace",
  "focalDominance",
  "legibility",
  "clipping",
  "color",
  "colorSystem",
  "materialLighting",
  "copy",
  "profileFidelity",
  "assetIntegrity"
];
var TITLE_MEDIA_DEPTHS = /* @__PURE__ */ new Set(["title-front", "media-front", "separate"]);
var TITLE_MEDIA_MECHANISMS = /* @__PURE__ */ new Set(["none", "mask", "interrupt"]);
var DOMINANT_AXES = /* @__PURE__ */ new Set([
  "horizontal",
  "vertical",
  "diagonal",
  "radial",
  "asymmetric-grid"
]);
var VISUAL_ROLES = /* @__PURE__ */ new Set([
  "background",
  "media",
  "overlay",
  "decoration",
  "title",
  "body",
  "metadata",
  "brand",
  "cta"
]);
var sha256 = (value) => createHash("sha256").update(value).digest("hex");
var finding = (code, path, message) => ({ code, path, message });
var isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var record = (value) => isObject(value) ? value : {};
var list = (value) => Array.isArray(value) ? value : [];
var nonEmptyStringList = (value) => Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
var normalizedRect = (value) => {
  const rect = record(value);
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  return [x, y, width, height].every(Number.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1 && y + height <= 1;
};
var textOf = (value) => Buffer.isBuffer(value) ? value.toString("utf8") : typeof value === "string" ? value : "";
var rawBytes = (model, path) => model?.bytes?.[path] ?? (Buffer.isBuffer(model?.files?.[path]) ? model.files[path] : Buffer.from(textOf(model?.files?.[path])));
var digestOf = (model, path) => model?.digests?.[path] ?? sha256(rawBytes(model, path));
var stageAtLeast = (stage, expected) => STAGE_RANK[stage] >= STAGE_RANK[expected];
function parseJson(files, path, findings) {
  if (!(path in files)) {
    findings.push(
      finding("REQUIRED_PATH_MISSING", path, `${path} is required`)
    );
    return null;
  }
  try {
    return JSON.parse(textOf(files[path]));
  } catch {
    findings.push(
      finding("JSON_INVALID", path, `${path} must contain valid JSON`)
    );
    return null;
  }
}
function parseDimension(value) {
  const match = String(value ?? "").trim().match(/^([0-9]+(?:\.[0-9]+)?)(?:px)?$/u);
  return match ? Number(match[1]) : Number.NaN;
}
function inspectPosterSvg(bytes) {
  const source = bytes.toString("utf8");
  if (bytes.byteLength < 40 || /<!DOCTYPE|<!ENTITY|<(?:script|foreignObject)\b|\son[a-z]+\s*=/iu.test(
    source
  ))
    throw new Error("SVG_UNSAFE");
  if (/\b(?:href|xlink:href)\s*=\s*["'](?:https?:|file:|\/\/)|\burl\(\s*["']?(?:https?:|file:|\/\/)/iu.test(
    source
  ))
    throw new Error("SVG_EXTERNAL_REFERENCE");
  const document = new import_xmldom.DOMParser().parseFromString(source, "image/svg+xml");
  const root = document.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg" || document.getElementsByTagName("parsererror").length > 0)
    throw new Error("SVG_INVALID");
  const width = parseDimension(root.getAttribute("width"));
  const height = parseDimension(root.getAttribute("height"));
  const viewBoxParts = String(root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/u).map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || viewBoxParts.length !== 4 || viewBoxParts.some((part) => !Number.isFinite(part)) || (viewBoxParts[2] ?? 0) <= 0 || (viewBoxParts[3] ?? 0) <= 0)
    throw new Error("SVG_DIMENSIONS_INVALID");
  return {
    width,
    height,
    viewBox: viewBoxParts
  };
}
function decodePosterPng(bytes) {
  try {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (bytes.byteLength < 57 || !bytes.subarray(0, 8).equals(signature))
      throw new Error("PNG_INVALID");
    let cursor = 8;
    let width = 0;
    let height = 0;
    let sawHeader = false;
    let sawEnd = false;
    const compressed = [];
    while (cursor < bytes.byteLength) {
      if (cursor + 12 > bytes.byteLength) throw new Error("PNG_INVALID");
      const length = bytes.readUInt32BE(cursor);
      const type = bytes.subarray(cursor + 4, cursor + 8);
      const dataStart = cursor + 8;
      const dataEnd = dataStart + length;
      if (length > 64 * 1024 * 1024 || dataEnd + 4 > bytes.byteLength)
        throw new Error("PNG_INVALID");
      const expectedCrc = bytes.readUInt32BE(dataEnd);
      if (pngCrc32(Buffer.concat([type, bytes.subarray(dataStart, dataEnd)])) !== expectedCrc)
        throw new Error("PNG_INVALID");
      const chunkType = type.toString("ascii");
      if (chunkType === "IHDR") {
        if (sawHeader || cursor !== 8 || length !== 13)
          throw new Error("PNG_INVALID");
        width = bytes.readUInt32BE(dataStart);
        height = bytes.readUInt32BE(dataStart + 4);
        const bitDepth = bytes[dataStart + 8];
        const colorType = bytes[dataStart + 9];
        const compression = bytes[dataStart + 10];
        const filter = bytes[dataStart + 11];
        const interlace = bytes[dataStart + 12];
        if (width <= 0 || height <= 0 || width > 8192 || height > 8192 || bitDepth !== 8 || colorType !== 6 || compression !== 0 || filter !== 0 || interlace !== 0)
          throw new Error("PNG_INVALID");
        sawHeader = true;
      } else if (chunkType === "IDAT")
        compressed.push(bytes.subarray(dataStart, dataEnd));
      else if (chunkType === "IEND") {
        if (length !== 0 || !sawHeader) throw new Error("PNG_INVALID");
        sawEnd = true;
        cursor = dataEnd + 4;
        break;
      }
      cursor = dataEnd + 4;
    }
    if (!sawHeader || !sawEnd || cursor !== bytes.byteLength || compressed.length === 0)
      throw new Error("PNG_INVALID");
    const rowBytes = width * 4;
    const raw = inflateSync(Buffer.concat(compressed), {
      maxOutputLength: height * (rowBytes + 1)
    });
    if (raw.byteLength !== height * (rowBytes + 1))
      throw new Error("PNG_INVALID");
    let opaque = 0;
    let previous = Buffer.alloc(rowBytes);
    const rgba = Buffer.alloc(width * height * 4);
    let offset = 0;
    for (let y = 0; y < height; y += 1) {
      const filterType = raw[offset++] ?? -1;
      const row = Buffer.from(raw.subarray(offset, offset + rowBytes));
      offset += rowBytes;
      if (filterType < 0 || filterType > 4) throw new Error("PNG_INVALID");
      for (let x = 0; x < rowBytes; x += 1) {
        const encoded = row[x] ?? 0;
        const left = x >= 4 ? row[x - 4] ?? 0 : 0;
        const up = previous[x] ?? 0;
        const upLeft = x >= 4 ? previous[x - 4] ?? 0 : 0;
        const predictor = filterType === 1 ? left : filterType === 2 ? up : filterType === 3 ? Math.floor((left + up) / 2) : filterType === 4 ? paeth(left, up, upLeft) : 0;
        row[x] = encoded + predictor & 255;
      }
      for (let x = 3; x < rowBytes; x += 4) if ((row[x] ?? 0) > 0) opaque += 1;
      row.copy(rgba, y * rowBytes);
      previous = row;
    }
    return { width, height, alphaCoverage: opaque / (width * height), rgba };
  } catch {
    throw new Error("PNG_INVALID");
  }
}
function inspectPosterPng(bytes) {
  const { width, height, alphaCoverage } = decodePosterPng(bytes);
  return { width, height, alphaCoverage };
}
function posterForegroundMask(bytes, canvasHex, threshold = 18) {
  if (!/^[a-f0-9]{6}$/iu.test(canvasHex))
    throw new Error("CANVAS_COLOR_INVALID");
  const { width, height, rgba } = decodePosterPng(bytes);
  const canvas = [0, 2, 4].map(
    (offset) => Number.parseInt(canvasHex.slice(offset, offset + 2), 16)
  );
  const mask = new Uint8Array(width * height);
  let foreground = 0;
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    const alpha = (rgba[offset + 3] ?? 0) / 255;
    const distance = [0, 1, 2].reduce((sum, channel) => {
      const composite = (rgba[offset + channel] ?? 0) * alpha + (canvas[channel] ?? 0) * (1 - alpha);
      return sum + Math.abs(composite - (canvas[channel] ?? 0));
    }, 0) / 3;
    if (distance >= threshold) {
      mask[index] = 1;
      foreground += 1;
    }
  }
  return { width, height, foregroundCoverage: foreground / mask.length, mask };
}
function measureMaskGeometry(mask, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || mask.length !== width * height) throw new Error("MASK_DIMENSIONS_INVALID");
  let count = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    count += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    sumX += x + 0.5;
    sumY += y + 0.5;
  }
  if (count === 0) return { occupancy: 0, bbox: null, centroid: null };
  return {
    occupancy: count / mask.length,
    bbox: { x: minX / width, y: minY / height, width: (maxX - minX + 1) / width, height: (maxY - minY + 1) / height },
    centroid: { x: sumX / count / width, y: sumY / count / height }
  };
}
function measureMaskRegionOccupancy(mask, width, height, region) {
  if (!normalizedRect(region) || mask.length !== width * height) throw new Error("MASK_REGION_INVALID");
  const x0 = Math.floor(region.x * width);
  const y0 = Math.floor(region.y * height);
  const x1 = Math.ceil((region.x + region.width) * width);
  const y1 = Math.ceil((region.y + region.height) * height);
  let foreground = 0;
  let pixels = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
    pixels += 1;
    if (mask[y * width + x]) foreground += 1;
  }
  return pixels > 0 ? foreground / pixels : 0;
}
var PNG_CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = (value & 1) !== 0 ? 3988292384 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function pngCrc32(bytes) {
  let crc = 4294967295;
  for (const byte of bytes)
    crc = (PNG_CRC_TABLE[(crc ^ byte) & 255] ?? 0) ^ crc >>> 8;
  return (crc ^ 4294967295) >>> 0;
}
function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonalDistance = Math.abs(estimate - upLeft);
  return leftDistance <= upDistance && leftDistance <= diagonalDistance ? left : upDistance <= diagonalDistance ? up : upLeft;
}
function computePosterSubjectDigest(model) {
  const paths = Object.keys(model?.files ?? {}).filter(
    (path) => !SUBJECT_EXCLUDED_PATH.test(path) && !SOURCE_PROOF.test(path)
  ).sort();
  return sha256(
    paths.map((path) => `${path}\0${digestOf(model, path)}
`).join("")
  );
}
function variantRecords(model) {
  try {
    return list(
      record(JSON.parse(textOf(model?.files?.["src/variants/manifest.json"]))).variants
    ).map(record);
  } catch {
    return [];
  }
}
function finalOutputPaths(model) {
  return variantRecords(model).flatMap((variant) => [
    `dist/${model?.artifactId}.${String(variant.id)}.svg`,
    `dist/${model?.artifactId}.${String(variant.id)}.png`
  ]);
}
function receiptOutputPaths(model) {
  return [
    ...finalOutputPaths(model),
    ...Object.keys(model?.files ?? {}).filter((path) => /^evidence\/layers\/.+\.(?:png|svg)$/u.test(path)).sort(),
    "evidence.render.json",
    "evidence.probe.json",
    "evidence.accessibility.json",
    "evidence.composition.json",
    "review.poster.json",
    "release.manifest.json"
  ];
}
function createPosterReleaseManifest(model) {
  return {
    schema: RELEASE_MANIFEST_SCHEMA,
    plugin: "poster-production",
    artifactId: model?.artifactId,
    subjectDigest: computePosterSubjectDigest(model),
    variants: variantRecords(model).map((variant) => ({
      id: variant.id,
      width: variant.width,
      height: variant.height,
      svg: `dist/${model?.artifactId}.${String(variant.id)}.svg`,
      svgSha256: digestOf(
        model,
        `dist/${model?.artifactId}.${String(variant.id)}.svg`
      ),
      png: `dist/${model?.artifactId}.${String(variant.id)}.png`,
      pngSha256: digestOf(
        model,
        `dist/${model?.artifactId}.${String(variant.id)}.png`
      )
    }))
  };
}
function createPosterReceipt(model) {
  return {
    schemaVersion: 2,
    plugin: "poster-production",
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest: computePosterSubjectDigest(model),
    outputs: Object.fromEntries(
      receiptOutputPaths(model).map((path) => [path, digestOf(model, path)])
    )
  };
}
function validatePosterReceipt(model) {
  try {
    const actual = record(
      JSON.parse(textOf(model?.files?.["receipt.release.json"]))
    );
    const expected = createPosterReceipt(model);
    return actual.schemaVersion === expected.schemaVersion && actual.plugin === expected.plugin && actual.artifactId === expected.artifactId && actual.stage === expected.stage && actual.subjectDigest === expected.subjectDigest && JSON.stringify(actual.outputs) === JSON.stringify(expected.outputs);
  } catch {
    return false;
  }
}
function validateBase(model, findings) {
  const files = model?.files ?? {};
  for (const path of REQUIRED_SOURCE_FILES)
    if (!(path in files))
      findings.push(
        finding("REQUIRED_PATH_MISSING", path, `${path} is required`)
      );
  if (".poster-delivery-journal.json" in files)
    findings.push(
      finding(
        "MUTATION_JOURNAL_OPEN",
        ".poster-delivery-journal.json",
        "an interrupted writer must be recovered"
      )
    );
  const plan = record(parseJson(files, "plan.contract.json", findings));
  const profile = String(plan.profile ?? "");
  if (plan.schema !== PLAN_SCHEMA || plan.artifactId !== model?.artifactId || !PROFILE_SET.has(profile) || !STAGE_SET.has(String(plan.targetStage)) || typeof plan.audience !== "string" || !plan.audience.trim() || typeof plan.objective !== "string" || !plan.objective.trim() || typeof plan.language !== "string")
    findings.push(
      finding(
        "PLAN_INVALID",
        "plan.contract.json",
        "plan must bind schema, artifact, profile, stage, audience, objective, and language"
      )
    );
  const art = record(parseJson(files, "plan.art-direction.json", findings));
  const letterform = record(art.letterform);
  const composition = record(art.composition);
  const massToVoid = record(composition.massToVoidTarget);
  const relation = record(composition.titleMediaRelation);
  const brief = record(art.brief);
  const constraints = record(art.constraints);
  const material = record(art.material);
  const lighting = record(art.lighting);
  const quietRegions = list(composition.quietRegions).map(record);
  const artInvalid = art.schema !== ART_DIRECTION_SCHEMA || art.profile !== profile || [
    "concept",
    "visualCenter",
    "hierarchy",
    "typographyStrategy",
    "colorRationale"
  ].some(
    (key) => typeof art[key] !== "string" || !String(art[key]).trim() || /TODO/u.test(String(art[key]))
  ) || ["audience", "objective", "environment"].some(
    (key) => typeof brief[key] !== "string" || !String(brief[key]).trim()
  ) || !nonEmptyStringList(constraints.mustKeep) || !nonEmptyStringList(constraints.mayChange) || !nonEmptyStringList(constraints.avoid) || [
    "typeClass",
    "strokeProfile",
    "structure",
    "edgeFinish",
    "sceneReference"
  ].some(
    (key) => typeof letterform[key] !== "string" || !String(letterform[key]).trim()
  ) || !DOMINANT_AXES.has(String(composition.dominantAxis)) || typeof composition.focalRelationship !== "string" || !composition.focalRelationship.trim() || !TITLE_MEDIA_DEPTHS.has(String(relation.depth)) || !TITLE_MEDIA_MECHANISMS.has(String(relation.mechanism)) || relation.depth === "separate" && relation.mechanism !== "none" || typeof composition.primaryFocalLayer !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(String(composition.primaryFocalLayer)) || !normalizedRect(composition.focalBox) || quietRegions.length === 0 || quietRegions.some(
    (region) => typeof region.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(String(region.id)) || !normalizedRect(region.box) || !Number.isFinite(region.maxOccupancy) || Number(region.maxOccupancy) < 0 || Number(region.maxOccupancy) > 1
  ) || !Number.isFinite(massToVoid.min) || !Number.isFinite(massToVoid.max) || Number(massToVoid.min) < 0 || Number(massToVoid.max) > 1 || Number(massToVoid.min) >= Number(massToVoid.max) || ["primary", "surfaceResponse"].some(
    (key) => typeof material[key] !== "string" || !String(material[key]).trim()
  ) || ["direction", "quality", "contrast"].some(
    (key) => typeof lighting[key] !== "string" || !String(lighting[key]).trim()
  ) || !Array.isArray(art.negativeRules) || art.negativeRules.length === 0;
  if (artInvalid)
    findings.push(
      finding(
        "ART_DIRECTION_INVALID",
        "plan.art-direction.json",
        "art direction must bind brief, constraints, focal and quiet regions, material, lighting, and negative rules"
      )
    );
  if (!communicationCoreValid(art.communicationCore)) findings.push(finding("COMMUNICATION_CORE_INVALID", "plan.art-direction.json", "poster art direction must bind a complete communicationCore"));
  else {
    const layerIds = Object.entries(files).filter(([path]) => /^src\/variants\/.+\/layers\/manifest\.json$/u.test(path)).flatMap(([, value]) => {
      try {
        return list(record(JSON.parse(textOf(value))).layers).map((entry) => String(record(entry).id ?? "")).filter(Boolean);
      } catch {
        return [];
      }
    });
    const allowed = new Set(layerIds.map((id) => `layer:${id}`));
    if (communicationAnchors(art.communicationCore).some((anchor) => !allowed.has(anchor))) findings.push(finding("COMMUNICATION_CUE_UNBOUND", "plan.art-direction.json", "every poster signature cue anchor must reference a current layer"));
  }
  const skills = record(
    parseJson(files, "plan.skill-composition.json", findings)
  );
  const workers = list(skills.workers).map(record);
  const workerMap = new Map(
    workers.map((worker) => [String(worker.name), worker])
  );
  if (skills.schema !== SKILL_COMPOSITION_SCHEMA || workers.length !== REQUIRED_ADVISORS.size || workers.some((worker) => Object.hasOwn(worker, "revision")) || [...REQUIRED_ADVISORS].some(
    (name) => !["used", "skipped", "unavailable"].includes(
      String(workerMap.get(name)?.status)
    )
  ))
    findings.push(
      finding(
        "SKILL_COMPOSITION_INVALID",
        "plan.skill-composition.json",
        "the four current-source advisors with truthful statuses are required"
      )
    );
  const assets = record(parseJson(files, "plan.assets.json", findings));
  const entries = list(assets.assets).map(record);
  if (assets.schema !== ASSET_MANIFEST_SCHEMA || entries.some(
    (asset) => typeof asset.path !== "string" || typeof asset.role !== "string" || !asset.role.trim() || !/^[a-f0-9]{64}$/u.test(String(asset.sha256)) || !["project", "user", "generated", "licensed", "public-domain"].includes(
      String(asset.sourceType)
    ) || !(String(asset.path) in files) || digestOf(model, String(asset.path)) !== asset.sha256 || asset.sourceType === "generated" && (!asset.tool || !asset.model || !/^[a-f0-9]{64}$/u.test(String(asset.promptDigest))) || ["licensed", "public-domain"].includes(String(asset.sourceType)) && (!/^https?:\/\//u.test(String(asset.sourceUrl)) || typeof asset.rightsStatus !== "string" || !asset.rightsStatus.trim())
  ))
    findings.push(
      finding(
        "ASSET_MANIFEST_INVALID",
        "plan.assets.json",
        "assets must be local, digest-bound, role-bound, and provenance-complete"
      )
    );
  const design = record(parseJson(files, "design.system.json", findings));
  const colorSystem = record(design.colors);
  const colors = record(colorSystem.tokens);
  const structuralRoles = record(colorSystem.structuralRoles);
  const colorScenarios = list(colorSystem.scenarios).map(record);
  const typography = record(design.typography);
  const fontRegistry = list(design.fontRegistry).map(record);
  const spacing = record(design.spacing);
  const contrastPairs = list(design.contrastPairs).map(record);
  const registryValid = fontRegistry.length > 0 && fontRegistry.every((font) => {
    const fontFiles = list(font.files).map(record);
    return typeof font.family === "string" && font.family.trim().length > 0 && typeof font.package === "string" && /^@[a-z0-9-]+\/[a-z0-9-]+$/u.test(font.package) && fontFiles.length > 0 && fontFiles.every(
      (file) => typeof file.path === "string" && /^[a-z0-9][a-z0-9._-]*\.woff2?$/iu.test(file.path) && Number.isInteger(file.weight) && Number(file.weight) >= 100 && Number(file.weight) <= 900 && ["latin", "cjk"].includes(String(file.script))
    );
  });
  const registryCoversTypography = Object.values(typography).map(record).every((role) => {
    const families = record(role.families);
    const scripts = role.scriptPolicy === "mixed" ? ["cjk", "latin"] : [String(role.scriptPolicy)];
    return scripts.every((script) => fontRegistry.some(
      (font) => font.family === families[script] && list(font.files).map(record).some((file) => file.weight === role.weight && file.script === script)
    ));
  });
  const colorSystemValid = Object.keys(colors).length >= 2 && Object.values(colors).every((color) => /^[a-f0-9]{6}$/iu.test(String(color))) && typeof colorSystem.core === "string" && String(colorSystem.core) in colors && ["canvas", "primaryText"].every((role) => typeof structuralRoles[role] === "string" && String(structuralRoles[role]) in colors) && Object.values(structuralRoles).every((token) => typeof token === "string" && token in colors) && colorScenarios.length > 0 && colorScenarios.every((scenario) => {
    const roles = record(scenario.roles);
    return typeof scenario.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(scenario.id) && Object.keys(structuralRoles).every((role) => typeof roles[role] === "string" && String(roles[role]) in colors) && Object.values(roles).includes(colorSystem.core);
  });
  if (design.schema !== DESIGN_SYSTEM_SCHEMA || !colorSystemValid || Object.keys(typography).length === 0 || Object.values(typography).map(record).some(
    (role) => !["cjk", "latin", "mixed"].includes(String(role.scriptPolicy)) || role.scriptPolicy !== "latin" && (typeof record(role.families).cjk !== "string" || !String(record(role.families).cjk).trim()) || role.scriptPolicy !== "cjk" && (typeof record(role.families).latin !== "string" || !String(record(role.families).latin).trim()) || !Number.isInteger(role.hierarchy) || Number(role.hierarchy) <= 0 || !["horizontal", "vertical"].includes(String(role.orientation)) || !["left", "center", "right"].includes(String(role.alignment)) || typeof role.trackingPolicy !== "string" || !role.trackingPolicy.trim() || !Number.isInteger(role.sizePx) || Number(role.sizePx) <= 0 || !Number.isInteger(role.weight) || !Number.isFinite(role.lineHeightPx) || Number(role.lineHeightPx) < Number(role.sizePx) || !Number.isFinite(role.letterSpacingEm) || Number(role.letterSpacingEm) < -0.08 || Number(role.letterSpacingEm) > 0.5 || !Number.isFinite(role.maxWidthPx) || Number(role.maxWidthPx) <= 0 || !Number.isInteger(role.maxLines) || Number(role.maxLines) <= 0
  ) || !registryValid || !registryCoversTypography || Number(spacing.safeAreaPx) <= 0 || Number(spacing.baseUnitPx) <= 0 || Number(spacing.paragraphGapPx) < 0 || contrastPairs.length === 0 || contrastPairs.some(
    (pair) => !(String(pair.foreground) in colors) || !(String(pair.background) in colors) || !Number.isFinite(pair.minimum) || Number(pair.minimum) < 1
  ))
    findings.push(
      finding(
        "DESIGN_SYSTEM_INVALID",
        "design.system.json",
        "role-based colors, scenarios, script-aware typography, registered font files, spacing, and valid contrast pairs are required"
      )
    );
  const project = record(parseJson(files, "poster.project.json", findings));
  if (project.schema !== PROJECT_SCHEMA || project.artifactId !== model?.artifactId || project.profile !== profile || project.entry !== "src/render.ts" || project.variantManifest !== "src/variants/manifest.json")
    findings.push(
      finding(
        "PROJECT_INVALID",
        "poster.project.json",
        "project must bind artifact, profile, entry, and variant manifest"
      )
    );
  if (!/theme\.fontRegistry/u.test(textOf(files["src/render.ts"])))
    findings.push(
      finding(
        "FONT_REGISTRY_UNBOUND",
        "src/render.ts",
        "renderer must load its Satori fonts from design.system.json fontRegistry"
      )
    );
}
function validateVariants(model, stage, findings) {
  const files = model?.files ?? {};
  const manifest = record(
    parseJson(files, "src/variants/manifest.json", findings)
  );
  const variants = list(manifest.variants).map(record);
  const design = record(parseJson(files, "design.system.json", findings));
  const scenarioIds = new Set(list(record(design.colors).scenarios).map((entry) => String(record(entry).id)));
  const art = record(parseJson(files, "plan.art-direction.json", findings));
  const artComposition = record(art.composition);
  const typographyRoles = new Set(Object.keys(record(design.typography)));
  if (manifest.schema !== VARIANT_MANIFEST_SCHEMA || variants.length === 0)
    findings.push(
      finding(
        "VARIANT_MANIFEST_INVALID",
        "src/variants/manifest.json",
        "at least one v3 variant is required"
      )
    );
  const seen = /* @__PURE__ */ new Set();
  for (const [offset, variant] of variants.entries()) {
    const directory = String(variant.directory ?? "");
    const id = String(variant.id ?? "");
    const match = directory.match(VARIANT_DIRECTORY);
    const width = Number(variant.width);
    const height = Number(variant.height);
    if (!match || variant.index !== offset + 1 || Number(match.groups?.index) !== variant.index || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) || seen.has(id) || !Number.isInteger(width) || !Number.isInteger(height) || width < 320 || height < 320 || width > 8192 || height > 8192 || !scenarioIds.has(String(variant.colorScenario))) {
      findings.push(
        finding(
          "VARIANT_INVALID",
          "src/variants/manifest.json",
          "variants must have unique ids, contiguous directories, and bounded integer dimensions"
        )
      );
      continue;
    }
    seen.add(id);
    const variantPath = `src/variants/${directory}/variant.json`;
    const variantConfig = record(parseJson(files, variantPath, findings));
    if (variantConfig.schema !== "poster-production/variant/v3" || variantConfig.id !== id || variantConfig.width !== width || variantConfig.height !== height || variantConfig.data !== `data/${id}.json` || variantConfig.colorScenario !== variant.colorScenario)
      findings.push(
        finding(
          "VARIANT_CONFIG_INVALID",
          variantPath,
          "variant config must match the manifest and data path"
        )
      );
    parseJson(files, `data/${id}.json`, findings);
    const layersPath = `src/variants/${directory}/layers/manifest.json`;
    const layerManifest = record(parseJson(files, layersPath, findings));
    const layers = list(layerManifest.layers).map(record);
    const layerIds = new Set(layers.map((layer) => String(layer.id)));
    if (layerManifest.schema !== LAYER_MANIFEST_SCHEMA || layers.length === 0 || record(layers[0]).role !== "background" || layerIds.size !== layers.length || !layerIds.has(String(artComposition.primaryFocalLayer)))
      findings.push(
        finding(
          "LAYER_MANIFEST_INVALID",
          layersPath,
          "a v3 manifest beginning with background and containing the declared focal layer is required"
        )
      );
    for (const [layerOffset, layer] of layers.entries()) {
      const source = String(layer.source ?? "");
      const sourcePath = `src/variants/${directory}/layers/${source}`;
      const sourceMatch = source.match(LAYER_SOURCE);
      if (!sourceMatch || layer.index !== layerOffset + 1 || typeof layer.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(String(layer.id)) || sourceMatch.groups?.role !== layer.role || !VISUAL_ROLES.has(String(layer.visualRole)) || layer.typographyRole !== void 0 && !typographyRoles.has(String(layer.typographyRole)) || !(sourcePath in files)) {
        findings.push(
          finding(
            "LAYER_INVALID",
            sourcePath,
            "layer id, filename, visual role, typography role, order, and source must agree"
          )
        );
        continue;
      }
      const sourceText = textOf(files[sourcePath]);
      if (OWNER_VIOLATION.test(sourceText) || (sourceText.match(
        /export\s+(?:async\s+)?function\s+buildLayer\s*\(/gu
      ) ?? []).length !== 1 || /from\s+["']\.\/[0-9]{3}-[^"']+["']/u.test(sourceText))
        findings.push(
          finding(
            "LAYER_OWNER_VIOLATION",
            sourcePath,
            "layer must be a deterministic isolated buildLayer module"
          )
        );
      if (stageAtLeast(stage, "render")) {
        const base = `evidence/layers/${id}/${source.slice(0, -4)}.${digestOf(model, sourcePath)}`;
        for (const extension of ["svg", "png"]) {
          const proofPath = `${base}.${extension}`;
          if (!(proofPath in files))
            findings.push(
              finding(
                "LAYER_PROOF_MISSING",
                proofPath,
                "current source-hash proof is required"
              )
            );
          else
            try {
              if (extension === "svg")
                inspectPosterSvg(rawBytes(model, proofPath));
              else inspectPosterPng(rawBytes(model, proofPath));
            } catch (error) {
              findings.push(
                finding(
                  "LAYER_PROOF_INVALID",
                  proofPath,
                  error instanceof Error ? error.message : String(error)
                )
              );
            }
        }
      }
    }
    if (stageAtLeast(stage, "render")) {
      for (const extension of ["svg", "png"]) {
        const output = `dist/${model?.artifactId}.${id}.${extension}`;
        if (!(output in files)) {
          findings.push(
            finding(
              "RENDER_OUTPUT_MISSING",
              output,
              "final SVG and PNG are required"
            )
          );
          continue;
        }
        try {
          const inspection = extension === "svg" ? inspectPosterSvg(rawBytes(model, output)) : inspectPosterPng(rawBytes(model, output));
          if (inspection.width !== width || inspection.height !== height)
            findings.push(
              finding(
                "RENDER_DIMENSION_MISMATCH",
                output,
                "output dimensions must match the variant"
              )
            );
        } catch (error) {
          findings.push(
            finding(
              "RENDER_OUTPUT_INVALID",
              output,
              error instanceof Error ? error.message : String(error)
            )
          );
        }
      }
    }
  }
}
function readEvidence(model, path) {
  try {
    return record(JSON.parse(textOf(model?.files?.[path])));
  } catch {
    return {};
  }
}
function evidenceHeaderCurrent(model, evidence, schema) {
  return evidence.schema === schema && evidence.plugin === "poster-production" && evidence.artifactId === model?.artifactId && evidence.subjectDigest === computePosterSubjectDigest(model) && evidence.verdict === "pass";
}
function expectedRenderPaths(model) {
  return [
    ...finalOutputPaths(model),
    ...Object.keys(model?.files ?? {}).filter(
      (path) => /^evidence\/layers\/.+\.(?:svg|png)$/u.test(path)
    )
  ].sort();
}
function renderEvidenceCurrent(model) {
  const evidence = readEvidence(model, "evidence.render.json");
  const outputs = list(evidence.outputs).map(record);
  const expected = expectedRenderPaths(model);
  return evidenceHeaderCurrent(model, evidence, RENDER_EVIDENCE_SCHEMA) && isObject(evidence.renderer) && typeof record(evidence.renderer).satori === "string" && typeof record(evidence.renderer).resvg === "string" && outputs.length === expected.length && outputs.every(
    (output, index) => output.path === expected[index] && output.sha256 === digestOf(model, expected[index] ?? "")
  );
}
function probeEvidenceCurrent(model) {
  const evidence = readEvidence(model, "evidence.probe.json");
  const measurements = list(evidence.measurements).map(record);
  const variants = variantRecords(model);
  const checks = list(evidence.checks).map(record);
  return evidenceHeaderCurrent(model, evidence, PROBE_EVIDENCE_SCHEMA) && measurements.length === variants.length && measurements.every((measurement, index) => {
    const variant = variants[index] ?? {};
    const id = String(variant.id);
    const svgPath = `dist/${model?.artifactId}.${id}.svg`;
    const pngPath = `dist/${model?.artifactId}.${id}.png`;
    const svg = record(measurement.svg);
    const png = record(measurement.png);
    return measurement.id === id && svg.width === variant.width && svg.height === variant.height && png.width === variant.width && png.height === variant.height && Number(png.alphaCoverage) >= 0.01 && measurement.svgSha256 === digestOf(model, svgPath) && measurement.pngSha256 === digestOf(model, pngPath) && measurement.independentRasterSha256 === digestOf(model, pngPath);
  }) && ["svg-png-byte-equivalence", "bounded-nonblank-raster"].every(
    (criterion) => checks.some(
      (check) => check.criterion === criterion && check.status === "pass"
    )
  );
}
function accessibilityEvidenceCurrent(model) {
  const evidence = readEvidence(model, "evidence.accessibility.json");
  const checks = list(evidence.checks).map(record);
  const design = readEvidence(model, "design.system.json");
  const pairs = list(design.contrastPairs).map(record);
  const typographyRoles = Object.keys(record(design.typography));
  return evidenceHeaderCurrent(model, evidence, ACCESSIBILITY_EVIDENCE_SCHEMA) && evidence.nonColorEncoding === true && checks.length >= pairs.length + typographyRoles.length && checks.every((check) => check.status === "pass") && pairs.every(
    (pair) => checks.some(
      (check) => check.criterion === `contrast:${String(pair.foreground)}:${String(pair.background)}` && Number(check.value) >= Number(pair.minimum)
    )
  ) && typographyRoles.every(
    (role) => checks.some((check) => check.role === role && check.status === "pass")
  );
}
function compositionEvidenceCurrent(model) {
  const evidence = readEvidence(model, "evidence.composition.json");
  const measurements = list(evidence.measurements).map(record);
  const variants = variantRecords(model);
  const art = readEvidence(model, "plan.art-direction.json");
  const composition = record(art.composition);
  const target = record(composition.massToVoidTarget);
  const declaredRelation = record(composition.titleMediaRelation);
  const declaredQuietRegions = list(composition.quietRegions).map(record);
  return evidenceHeaderCurrent(model, evidence, COMPOSITION_EVIDENCE_SCHEMA) && measurements.length === variants.length && measurements.every((measurement, index) => {
    const foreground = Number(measurement.foregroundCoverage);
    const voidCoverage = Number(measurement.voidCoverage);
    const focal = record(measurement.focal);
    const relation = record(measurement.titleMediaRelation);
    const quietRegions = list(measurement.quietRegions).map(record);
    return measurement.id === variants[index]?.id && measurement.status === "pass" && Number.isFinite(foreground) && Number.isFinite(voidCoverage) && Math.abs(foreground + voidCoverage - 1) < 1e-3 && foreground >= Number(target.min) && foreground <= Number(target.max) && focal.layerId === composition.primaryFocalLayer && focal.withinDeclaredBox === true && normalizedRect(focal.bbox) && isObject(focal.centroid) && Number(record(focal.centroid).x) >= 0 && Number(record(focal.centroid).x) <= 1 && Number(record(focal.centroid).y) >= 0 && Number(record(focal.centroid).y) <= 1 && relation.depth === declaredRelation.depth && relation.mechanism === declaredRelation.mechanism && Number.isFinite(Number(relation.overlapRatio)) && Number(relation.overlapRatio) >= 0 && (declaredRelation.depth === "separate" ? Number(relation.overlapRatio) <= 0.01 : Number(relation.overlapRatio) >= 0.01) && relation.orderMatches === true && quietRegions.length === declaredQuietRegions.length && quietRegions.every(
      (region, regionIndex) => region.id === declaredQuietRegions[regionIndex]?.id && Number(region.occupancy) <= Number(declaredQuietRegions[regionIndex]?.maxOccupancy) && region.status === "pass"
    );
  });
}
function reviewEvidenceCurrent(model) {
  const evidence = readEvidence(model, "review.poster.json");
  const variants = variantRecords(model);
  const reviewed = list(evidence.variants).map(record);
  const checks = record(evidence.checks);
  const reviewFindings = list(evidence.findings).map(record);
  return evidenceHeaderCurrent(model, evidence, REVIEW_SCHEMA) && reviewed.length === variants.length && reviewed.every(
    (variant, index) => variant.id === variants[index]?.id && variant.verdict === "pass" && variant.pngSha256 === digestOf(
      model,
      `dist/${model?.artifactId}.${String(variant.id)}.png`
    )
  ) && REVIEW_CHECKS.every((key) => {
    const check = record(checks[key]);
    return check.status === "pass" && typeof check.anchor === "string" && check.anchor.trim().length > 0 && typeof check.evidence === "string" && check.evidence.trim().length > 0 && typeof check.recovery === "string" && check.recovery.trim().length > 0;
  }) && reviewFindings.every(
    (entry) => ["low", "medium", "high", "critical"].includes(
      String(entry.severity)
    ) && typeof entry.anchor === "string" && entry.anchor.trim() && typeof entry.evidence === "string" && entry.evidence.trim() && typeof entry.recovery === "string" && entry.recovery.trim() && ["resolved", "accepted"].includes(String(entry.disposition)) && !(entry.disposition === "accepted" && ["high", "critical"].includes(String(entry.severity)))
  );
}
function validatePosterModel(model, { stage = "source" } = {}) {
  if (typeof stage !== "string" || !STAGE_SET.has(stage))
    return [
      finding(
        "STAGE_INVALID",
        "plan.contract.json",
        `unsupported poster stage: ${String(stage)}`
      )
    ];
  const typedStage = stage;
  const findings = [];
  validateBase(model, findings);
  validateVariants(model, typedStage, findings);
  if (stageAtLeast(typedStage, "render") && !renderEvidenceCurrent(model))
    findings.push(
      finding(
        "RENDER_EVIDENCE_INVALID",
        "evidence.render.json",
        "render evidence must bind every current output digest and renderer"
      )
    );
  if (stageAtLeast(typedStage, "probe")) {
    if (!probeEvidenceCurrent(model))
      findings.push(
        finding(
          "PROBE_EVIDENCE_INVALID",
          "evidence.probe.json",
          "probe evidence must bind dimensions, decoded raster coverage, and independently reproduced output digests"
        )
      );
    if (!accessibilityEvidenceCurrent(model))
      findings.push(
        finding(
          "ACCESSIBILITY_EVIDENCE_INVALID",
          "evidence.accessibility.json",
          "accessibility evidence must bind all current contrast, typography, and non-color checks"
        )
      );
    if (!compositionEvidenceCurrent(model))
      findings.push(
        finding(
          "COMPOSITION_EVIDENCE_INVALID",
          "evidence.composition.json",
          "composition evidence must bind measured foreground/void coverage and the declared title-media relation"
        )
      );
  }
  if (stageAtLeast(typedStage, "review")) {
    if (!reviewEvidenceCurrent(model))
      findings.push(
        finding(
          "REVIEW_INVALID",
          "review.poster.json",
          "independent passing review must cover every current variant and required visual check"
        )
      );
    else {
      const review2 = record(
        JSON.parse(textOf(model?.files?.["review.poster.json"]))
      );
      const reviewer = record(review2.reviewer);
      const renderSession = record(
        readEvidence(model, "evidence.render.json")
      ).sessionId;
      if (!["human", "independent-agent"].includes(String(reviewer.kind)) || typeof reviewer.id !== "string" || !reviewer.id || typeof reviewer.sessionId !== "string" || !reviewer.sessionId || reviewer.sessionId === renderSession || reviewer.sessionId === (process.env.AI_EXPERTS_SESSION_ID || "unknown"))
        findings.push(
          finding(
            "REVIEW_SELF",
            "review.poster.json",
            "reviewer identity and session must be independent from rendering and the current session"
          )
        );
    }
    const review = readEvidence(model, "review.poster.json");
    const art = record(parseJson(model?.files ?? {}, "plan.art-direction.json", findings));
    const core = record(art.communicationCore);
    if (!communicationReviewValid(review, core.retellTarget, communicationAnchors(core))) findings.push(finding("COMMUNICATION_REVIEW_INVALID", "review.poster.json", "poster review must record a two-pass retell and bind every communication check to the frozen signature cue"));
  }
  if (stageAtLeast(typedStage, "release")) {
    try {
      if (JSON.stringify(
        record(JSON.parse(textOf(model?.files?.["release.manifest.json"])))
      ) !== JSON.stringify(createPosterReleaseManifest(model)))
        findings.push(
          finding(
            "RELEASE_MANIFEST_INVALID",
            "release.manifest.json",
            "release manifest must map current SVG and PNG outputs"
          )
        );
    } catch {
      findings.push(
        finding(
          "RELEASE_MANIFEST_INVALID",
          "release.manifest.json",
          "release manifest is required"
        )
      );
    }
    if (!("receipt.release.json" in (model?.files ?? {})))
      findings.push(
        finding(
          "RELEASE_PATH_MISSING",
          "receipt.release.json",
          "release receipt is required"
        )
      );
    else if (!validatePosterReceipt(model))
      findings.push(
        finding(
          "RECEIPT_INVALID",
          "receipt.release.json",
          "receipt must bind current source and all delivery bytes"
        )
      );
  }
  return findings.sort(
    (left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path)
  );
}
function resolveWorkspaceRoot(cwd) {
  let current = resolve(cwd);
  while (current !== dirname(current)) {
    if (basename(dirname(current)) === "poster" && basename(dirname(dirname(current))) === "artifacts")
      return dirname(dirname(dirname(current)));
    current = dirname(current);
  }
  return resolve(cwd);
}
function isPosterProjectRoot(root, workspaceRoot) {
  return dirname(resolve(root)) === resolve(workspaceRoot, "artifacts", "poster") && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root));
}
async function findPosterProjects(cwd) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const carrier = join(workspaceRoot, "artifacts", "poster");
  try {
    const entries = await readdir(carrier, { withFileTypes: true });
    if (entries.length > 128) throw new Error("PROJECT_COUNT_LIMIT_EXCEEDED");
    return entries.filter(
      (entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name)
    ).map((entry) => join(carrier, entry.name)).sort();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      return [];
    throw error;
  }
}
async function collectProject(root, directory, model, counter) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name))
      continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory())
      await collectProject(root, absolute, model, counter);
    else if (entry.isFile()) {
      if (++counter.files > 2048)
        throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
      const bytes = await readFile(absolute);
      counter.bytes += bytes.byteLength;
      if (bytes.byteLength > 32 * 1024 * 1024 || counter.bytes > 256 * 1024 * 1024)
        throw new Error("PROJECT_SIZE_LIMIT_EXCEEDED");
      const path = relative(root, absolute).replaceAll("\\", "/");
      model.bytes[path] = bytes;
      model.digests[path] = sha256(bytes);
      model.files[path] = /\.(?:png|woff|woff2|ttf|otf)$/iu.test(path) ? bytes : bytes.toString("utf8");
    }
  }
}
async function loadPosterProject(root) {
  const model = {
    files: {},
    bytes: {},
    digests: {}
  };
  await collectProject(root, root, model, { files: 0, bytes: 0 });
  const parse = (path) => {
    try {
      return JSON.parse(textOf(model.files[path]));
    } catch {
      return null;
    }
  };
  return {
    root,
    artifactId: basename(root),
    ...model,
    plan: parse("plan.contract.json"),
    project: parse("poster.project.json")
  };
}
function posterProjectInside(relativePath = "", cwd = "") {
  const normalized = relativePath.replaceAll("\\", "/");
  const absolute = resolve(cwd || ".", relativePath).replaceAll("\\", "/");
  for (const candidate of [normalized, absolute]) {
    const match = candidate.match(
      /(?:^|\/)artifacts\/poster\/[^/]+\/(?<inside>.+)$/u
    );
    if (match?.groups?.inside) return match.groups.inside;
  }
  return "";
}
function evaluatePosterWrite({
  relativePath = "",
  toolName = "",
  writer = "",
  cwd = ""
} = {}) {
  const inside = posterProjectInside(relativePath, cwd);
  if (!inside) return { decision: "allow" };
  if ((GENERATED_PATH.test(inside) || SOURCE_PROOF_PATH.test(inside)) && !writer.startsWith("poster-"))
    return {
      decision: "deny",
      code: "PROTECTED_WRITER_REQUIRED",
      message: `${inside} must be written by a registered poster writer, not ${toolName || "an unregistered tool"}`
    };
  return { decision: "allow" };
}

// plugins/artifact-production/src/domains/poster/lib/writer.ts
import { mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
import { basename as basename2, dirname as dirname2, join as join2, resolve as resolve2 } from "node:path";
function assertPosterProjectRoot(value, { allowMissing = false } = {}) {
  const root = resolve2(value ?? "");
  const workspaceRoot = resolveWorkspaceRoot(allowMissing ? resolve2(root, "../../..") : root);
  if (!isPosterProjectRoot(root, workspaceRoot)) throw new Error("PROJECT_ROOT_OUT_OF_SCOPE");
  return root;
}
function sessionMetadata(capability, grant = {}) {
  return {
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    sessionId: grant.sessionId ?? process.env.AI_EXPERTS_SESSION_ID ?? "unknown",
    triggerFrom: grant.triggerFrom ?? process.env.AI_EXPERTS_TRIGGER_FROM ?? "unknown",
    capability
  };
}
async function atomicWriteJson(root, relativePath, payload) {
  const target = join2(root, relativePath);
  const temporaryDirectory = join2(root, ".tmp", "poster-guard");
  await mkdir(temporaryDirectory, { recursive: true });
  const temporary = join2(temporaryDirectory, `${basename2(relativePath)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}
`, { flag: "wx" });
  await mkdir(dirname2(target), { recursive: true });
  await rename(temporary, target);
}
async function withWriterJournal(root, capability, callback, grant = {}) {
  const journalPath = join2(root, ".poster-delivery-journal.json");
  const handle = await open(journalPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify({ schemaVersion: 2, plugin: "poster-production", operation: capability, artifactId: basename2(root), ...sessionMetadata(capability, grant) })}
`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const result = await callback();
  await unlink(journalPath).catch((error) => {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
    if (code !== "ENOENT") throw error;
  });
  return result;
}

export {
  POSTER_PROFILES,
  PLAN_SCHEMA,
  ART_DIRECTION_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  ASSET_MANIFEST_SCHEMA,
  DESIGN_SYSTEM_SCHEMA,
  PROJECT_SCHEMA,
  VARIANT_MANIFEST_SCHEMA,
  LAYER_MANIFEST_SCHEMA,
  RENDER_EVIDENCE_SCHEMA,
  PROBE_EVIDENCE_SCHEMA,
  ACCESSIBILITY_EVIDENCE_SCHEMA,
  COMPOSITION_EVIDENCE_SCHEMA,
  REVIEW_INPUT_SCHEMA,
  REVIEW_SCHEMA,
  inspectPosterSvg,
  inspectPosterPng,
  posterForegroundMask,
  measureMaskGeometry,
  measureMaskRegionOccupancy,
  computePosterSubjectDigest,
  createPosterReleaseManifest,
  createPosterReceipt,
  validatePosterReceipt,
  validatePosterModel,
  resolveWorkspaceRoot,
  findPosterProjects,
  loadPosterProject,
  evaluatePosterWrite,
  assertPosterProjectRoot,
  sessionMetadata,
  atomicWriteJson,
  withWriterJournal
};
