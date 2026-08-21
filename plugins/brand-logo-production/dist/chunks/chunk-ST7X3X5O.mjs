// harness-source-hash: sha256:1f02a1f296070b914c2c210b4d4f90f547785bacdf653357cefc199b3477b1d3

// plugins/brand-logo-production/src/lib/png-decode.ts
import { inflateSync } from "node:zlib";
var PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function decodePngToRgba(buf) {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error("PNG_SIGNATURE_INVALID");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    offset += 4;
    const type = bytes.toString("ascii", offset, offset + 4);
    offset += 4;
    const data = bytes.subarray(offset, offset + length);
    offset += length + 4;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === "IDAT") {
      idats.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (!(width > 0) || !(height > 0) || bitDepth !== 8) {
    throw new Error(`PNG_UNSUPPORTED:${width}x${height} depth=${bitDepth}`);
  }
  if (![2, 6].includes(colorType)) {
    throw new Error(`PNG_COLOR_TYPE_UNSUPPORTED:${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idats));
  const stride = 1 + width * bpp;
  if (raw.length !== height * stride) {
    throw new Error(`PNG_RAW_SIZE_MISMATCH:${raw.length}!=${height * stride}`);
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  const prev = new Uint8Array(width * bpp);
  const curr = new Uint8Array(width * bpp);
  for (let y = 0; y < height; y += 1) {
    const row = raw.subarray(y * stride, (y + 1) * stride);
    const filter = row[0];
    const slice = row.subarray(1);
    for (let i = 0; i < slice.length; i += 1) {
      const left = i >= bpp ? curr[i - bpp] ?? 0 : 0;
      const up = prev[i] ?? 0;
      const upLeft = i >= bpp ? prev[i - bpp] ?? 0 : 0;
      let val = slice[i] ?? 0;
      if (filter === 1) val = val + left & 255;
      else if (filter === 2) val = val + up & 255;
      else if (filter === 3) val = val + Math.floor((left + up) / 2) & 255;
      else if (filter === 4) val = val + paeth(left, up, upLeft) & 255;
      else if (filter !== 0) throw new Error(`PNG_FILTER_UNSUPPORTED:${filter}`);
      curr[i] = val;
    }
    for (let x = 0; x < width; x += 1) {
      const si = x * bpp;
      const di = (y * width + x) * 4;
      rgba[di] = curr[si] ?? 0;
      rgba[di + 1] = curr[si + 1] ?? 0;
      rgba[di + 2] = curr[si + 2] ?? 0;
      rgba[di + 3] = bpp === 4 ? curr[si + 3] ?? 0 : 255;
    }
    prev.set(curr);
  }
  return { width, height, rgba };
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// plugins/brand-logo-production/src/lib/contract.ts
import { createHash } from "node:crypto";
import { inflateSync as inflateSync2 } from "node:zlib";
var PATH_ARITY = { A: 7, C: 6, H: 1, L: 2, M: 2, Q: 4, S: 4, T: 2, V: 1, Z: 0 };
var PLAN_SCHEMA = "brand-logo-production/plan/v1";
var BRIEF_SCHEMA = "brand-logo-production/brief/v2";
var WORDMARK_MANIFEST_SCHEMA = "brand-logo-production/wordmark-manifest/v1";
var BRAND_CONTEXT_SCHEMA = "brand-logo-production/brand-context/v1";
var ASSET_PLAN_SCHEMA = "brand-logo-production/assets/v1";
var COLOR_SYSTEM_SCHEMA = "brand-logo-production/color-system/v1";
var DELIVERY_PROFILE_SCHEMA = "brand-logo-production/delivery-profile/v1";
var INTEGRATION_PLAN_SCHEMA = "brand-logo-production/integration/v1";
var CONCEPT_SELECTION_SCHEMA = "brand-logo-production/concept-selection/v1";
var SKILL_COMPOSITION_SCHEMA = "brand-logo-production/skill-composition/v2";
var SKILL_ADVICE_SCHEMA = "brand-logo-production/skill-advice/v1";
var SKILL_ADVICE_INPUT_SCHEMA = "brand-logo-production/skill-advice-input/v1";
var PROJECT_SCHEMA = "brand-logo-production/project/v1";
var CONSTRUCTION_SCHEMA = "brand-logo-production/construction/v1";
var STANDARD_GRID_SCHEMA = "brand-logo-production/standard-grid/v1";
var GEOMETRY_SCHEMA = "brand-logo-production/geometry/v1";
var FIBONACCI_SCHEMA = "brand-logo-production/fibonacci/v1";
var CONSTRUCTION_MANIFEST_SCHEMA = "brand-logo-production/construction-manifest/v1";
var ACCESSIBILITY_SCHEMA = "brand-logo-production/accessibility/v1";
var RENDER_EVIDENCE_SCHEMA = "brand-logo-production/render-evidence/v1";
var REVIEW_INPUT_SCHEMA = "brand-logo-production/review-input/v1";
var REVIEW_SCHEMA = "brand-logo-production/review/v2";
var RELEASE_MANIFEST_SCHEMA = "brand-logo-production/release-manifest/v2";
var PLUGIN = "brand-logo-production";
var STAGES = /* @__PURE__ */ new Set(["source", "release"]);
var ROLES = ["mark", "wordmark", "lockup"];
var VARIANTS = ["primary", "mono", "reverse"];
var BASE_SHEETS = ["standard", "geometry"];
var CONSTRUCTION_METHODS = /* @__PURE__ */ new Set(["modular-grid", "geometric", "typographic", "optical", "fibonacci"]);
var CONCEPT_BUCKETS = ["symbolic", "typographic", "monogram", "negative-space", "geometric", "narrative"];
var CONCEPT_SOURCE = /^(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.logo\.tsx$/u;
var CONCEPT_PROOF_PATH = /^src\/concepts\/.+\.[0-9a-f]{64}\.png$/u;
var GENERATED_PATH = /^(?:build\/|dist\/|evidence(?:\.|\/)|review\.logo\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$|\.logo-delivery-journal\.json$)/u;
var MASTER_VECTOR_VIOLATION = /(?:<\s*(?:image|text|foreignObject|script|style|iframe)\b|https?:\/\/|(?:from\s+|import\s*\(|require\s*\()\s*["']node:[^"']+["']|\b(?:fetch|useState|useEffect|setTimeout|setInterval|XMLHttpRequest|WebSocket|eval)\s*\(|\b(?:Date\.now|Math\.random|new\s+Function)\s*\(|\b(?:Bun|Deno)\.)/u;
var VECTOR_ELEMENT = /<(?:path|circle|ellipse|rect|line|polyline|polygon)\b/u;
var FORBIDDEN_SVG = /<(?:image|text|foreignObject|script|style|iframe|use|filter)\b|<!DOCTYPE\b|<\?xml-stylesheet\b|url\(\s*https?:|\s(?:width|height|transform|style|class|clip-path|mask|display|visibility|opacity|fill-opacity|stroke-opacity|on[a-z]+)\s*=|(?:href|xlink:href)\s*=\s*["'](?:https?:|data:)/u;
var SVG_TAGS = /* @__PURE__ */ new Set(["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs", "linearGradient", "radialGradient", "stop"]);
var PRIMITIVE_TYPES = /* @__PURE__ */ new Set(["circle", "ellipse", "rect", "line", "arc", "polygon", "path"]);
var FIB_SEQUENCE = [1, 1, 2, 3, 5, 8, 13];
var PHI = 1.618033988749895;
var AESTHETIC_CRITERIA = ["structureConsistency", "opticalCorrection", "singleMemoryPoint", "semanticIntegration", "markWordmarkSystem", "restraint"];
var REVIEW_CHECKS = ["brief-fidelity", "wordmark-copy", "script-fidelity", "spacing-rhythm", "concept-divergence", "vector-craft", "color-system", "mono-reverse", "scene-application", "delivery-profile"];
var EXTERNAL_SKILLS = [
  { name: "logo-brand-direction", role: "brand-direction", languages: ["en", "zh-CN"], ecosystem: "bilingual", mode: "adviser", phases: ["brief", "concept"] },
  { name: "logo-form-language", role: "vector-production", languages: ["en", "zh-CN"], ecosystem: "bilingual", mode: "reference-only", phases: ["concept", "master", "variants", "preview"] },
  { name: "logo-color-accessibility", role: "color-accessibility", languages: ["en", "zh-CN"], ecosystem: "bilingual", mode: "reference-only", phases: ["variants", "preview"] },
  { name: "logo-presentation-system", role: "presentation", languages: ["en", "zh-CN"], ecosystem: "bilingual", mode: "reference-only", phases: ["preview", "release"] }
];
var sha256 = (value) => createHash("sha256").update(value).digest("hex");
var finding = (code, path, message) => ({ code, path, message });
var isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var textOf = (value) => Buffer.isBuffer(value) ? value.toString("utf8") : typeof value === "string" ? value : "";
var rawBytes = (model, filePath) => {
  const fromBytes = model?.bytes?.[filePath];
  if (Buffer.isBuffer(fromBytes)) return fromBytes;
  const value = model?.files?.[filePath];
  return Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : "");
};
var fileDigest = (model, filePath) => model?.digests?.[filePath] ?? sha256(rawBytes(model, filePath));
var hasFile = (model, filePath) => Object.prototype.hasOwnProperty.call(model?.files ?? {}, filePath);
function stageName(value) {
  return typeof value === "string" && STAGES.has(value);
}
function parseJson(files, filePath, findings, code = "JSON_INVALID") {
  if (!Object.prototype.hasOwnProperty.call(files ?? {}, filePath)) {
    findings.push(finding(filePath === "plan.contract.json" ? "PLAN_CONTRACT_MISSING" : "REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
    return null;
  }
  try {
    return JSON.parse(textOf(files?.[filePath]));
  } catch {
    findings.push(finding(code, filePath, `${filePath} must contain valid JSON`));
    return null;
  }
}
function generatedSubjectPath(filePath) {
  return GENERATED_PATH.test(filePath) || CONCEPT_PROOF_PATH.test(filePath);
}
function computeLogoSubjectDigest(model) {
  return sha256(Object.keys(model?.digests ?? model?.files ?? {}).filter((filePath) => !generatedSubjectPath(filePath)).sort((left, right) => left.localeCompare(right)).map((filePath) => `${filePath}\0${fileDigest(model, filePath)}
`).join(""));
}
function masterSubjectDigest(model) {
  return sha256(ROLES.map((role) => {
    const filePath = `build/master/${role}.svg`;
    return `${filePath}\0${fileDigest(model, filePath)}
`;
  }).join(""));
}
function conceptPreviewPaths(model) {
  try {
    const manifest = JSON.parse(textOf(model?.files?.["src/concepts/manifest.json"]));
    const concepts = isObject(manifest) && Array.isArray(manifest.concepts) ? manifest.concepts : [];
    return concepts.flatMap((entry) => {
      const record = isObject(entry) ? entry : void 0;
      const sourcePath = `src/concepts/${record?.source ?? ""}`;
      return hasFile(model, sourcePath) ? [`src/concepts/${(record?.source).slice(0, -9)}.${fileDigest(model, sourcePath)}.png`] : [];
    });
  } catch {
    return [];
  }
}
function constructionMethod(model) {
  try {
    const config = JSON.parse(textOf(model?.files?.["src/construction/construction.json"]));
    return isObject(config) && typeof config.method === "string" ? config.method : "fibonacci";
  } catch {
    return "fibonacci";
  }
}
function constructionSheetNames(model) {
  return constructionMethod(model) === "fibonacci" ? [...BASE_SHEETS, "fibonacci"] : [...BASE_SHEETS];
}
function constructionPaths(model) {
  const digest = masterSubjectDigest(model);
  return [
    ...constructionSheetNames(model).flatMap((sheet) => ["svg", "png"].map((extension) => `evidence/construction/${sheet}.${digest}.${extension}`)),
    `evidence/construction/manifest.${digest}.json`
  ];
}
function finalOutputPaths() {
  return [
    ...VARIANTS.flatMap((variant) => ROLES.map((role) => `dist/${variant}/${role}.svg`)),
    ...ROLES.map((role) => `dist/primary/${role}.png`),
    "dist/primary/lockup-stacked.svg",
    ...[64, 128, 256, 512].map((size) => `dist/exports/mark-${size}.png`),
    ...[16, 32].map((size) => `dist/icons/favicon-${size}.png`),
    "dist/icons/app-icon-512.png",
    "dist/presentation/specimen.png",
    "dist/presentation/application-mockup.png",
    "dist/print/production-notes.json",
    "dist/integration/figma-import.json",
    "evidence.render.json",
    "evidence.accessibility.json",
    "review.logo.json",
    "release.manifest.json"
  ];
}
function previewEvidencePaths(model) {
  const digest = masterSubjectDigest(model);
  return [
    `evidence/preview/strip.${digest}.png`,
    `evidence/preview/strip.${digest}.manifest.json`,
    `evidence/preview/squint.${digest}.json`
  ];
}
function reviewArtifactPaths(model) {
  return [
    ...ROLES.map((role) => `build/master/${role}.svg`),
    ...constructionPaths(model),
    ...VARIANTS.flatMap((variant) => ROLES.map((role) => `dist/${variant}/${role}.svg`)),
    ...ROLES.map((role) => `dist/primary/${role}.png`),
    ...previewEvidencePaths(model)
  ].sort((left, right) => left.localeCompare(right));
}
function logoDeliveryPaths(model, { stage = "release" } = {}) {
  const sourcePaths = [...conceptPreviewPaths(model), ...ROLES.map((role) => `build/master/${role}.svg`), ...constructionPaths(model)];
  return stage === "release" ? [...sourcePaths, ...previewEvidencePaths(model), ...finalOutputPaths()] : sourcePaths;
}
function createConstructionManifest(model) {
  const masterDigest = masterSubjectDigest(model);
  const sheets = Object.fromEntries(constructionSheetNames(model).map((sheet) => [sheet, Object.fromEntries(["svg", "png"].map((extension) => {
    const path = `evidence/construction/${sheet}.${masterDigest}.${extension}`;
    return [extension, { path, sha256: fileDigest(model, path) }];
  }))]));
  return { schema: CONSTRUCTION_MANIFEST_SCHEMA, plugin: PLUGIN, artifactId: model?.artifactId, masterDigest, sheets };
}
function createLogoReleaseManifest(model) {
  const outputs = logoDeliveryPaths(model, { stage: "release" }).filter((path) => path !== "release.manifest.json");
  return {
    schema: RELEASE_MANIFEST_SCHEMA,
    plugin: PLUGIN,
    artifactId: model?.artifactId,
    subjectDigest: computeLogoSubjectDigest(model),
    outputs: Object.fromEntries(outputs.map((path) => [path, fileDigest(model, path)]))
  };
}
function createLogoReceipt(model) {
  return {
    schemaVersion: 3,
    plugin: PLUGIN,
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest: computeLogoSubjectDigest(model),
    outputs: Object.fromEntries(logoDeliveryPaths(model, { stage: "release" }).map((path) => [path, fileDigest(model, path)]))
  };
}
function exactJson(actualText, expected) {
  try {
    return JSON.stringify(JSON.parse(textOf(actualText))) === JSON.stringify(expected);
  } catch {
    return false;
  }
}
function validateLogoReceipt(model) {
  try {
    const actual = JSON.parse(textOf(model?.files?.["receipt.release.json"]));
    const expected = createLogoReceipt(model);
    if (!isObject(actual)) return false;
    return actual.schemaVersion === expected.schemaVersion && actual.plugin === expected.plugin && actual.artifactId === expected.artifactId && actual.stage === expected.stage && actual.subjectDigest === expected.subjectDigest && JSON.stringify(actual.outputs) === JSON.stringify(expected.outputs);
  } catch {
    return false;
  }
}
function extractSvgCircles(svg) {
  if (typeof svg !== "string") return [];
  const circles = [];
  for (const match of svg.matchAll(/<circle\b([^>]*?)(?:\/>|>)/giu)) {
    const attrs = match[1] ?? "";
    const cx = Number(attrs.match(/\bcx\s*=\s*["']?(-?[\d.]+)/u)?.[1]);
    const cy = Number(attrs.match(/\bcy\s*=\s*["']?(-?[\d.]+)/u)?.[1]);
    const r = Number(attrs.match(/\br\s*=\s*["']?(-?[\d.]+)/u)?.[1]);
    if ([cx, cy, r].every((n) => Number.isFinite(n) && n >= 0)) circles.push({ cx, cy, r });
  }
  return circles;
}
function extractSvgPathPoints(svg) {
  if (typeof svg !== "string") return [];
  const points = [];
  for (const match of svg.matchAll(/<path\b([^>]*?)(?:\/>|>)/giu)) {
    const attrs = match[1] ?? "";
    const d = attrs.match(/\bd\s*=\s*["']([^"']+)["']/u)?.[1] ?? "";
    let x = 0;
    let y = 0;
    for (const token of d.matchAll(/([MmLl])\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/gu)) {
      const cmd = token[1];
      const px = Number(token[2]);
      const py = Number(token[3]);
      if (cmd === "M" || cmd === "L") {
        x = px;
        y = py;
      } else {
        x += px;
        y += py;
      }
      points.push({ x, y });
    }
  }
  return points;
}
function fibAdjacent(a, b) {
  const i = FIB_SEQUENCE.lastIndexOf(a);
  const j = FIB_SEQUENCE.lastIndexOf(b);
  if (i < 0 || j < 0) return false;
  return Math.abs(i - j) === 1 || a === 1 && b === 1;
}
function expectedRatio(larger, smaller) {
  if (!(larger > 0) || !(smaller > 0)) return null;
  return larger / smaller;
}
function validateRequired(files, findings) {
  for (const filePath of [
    ".gitignore",
    "package.json",
    "package-lock.json",
    "plan.contract.json",
    "plan.brief.json",
    "plan.context.json",
    "plan.skill-composition.json",
    "plan.assets.json",
    "plan.color-system.json",
    "plan.concept-selection.json",
    "plan.delivery-profile.json",
    "plan.integration.json",
    "logo.project.json",
    "src/render.ts",
    "src/concepts/manifest.json",
    "src/master/Mark.logo.tsx",
    "src/master/wordmark.manifest.json",
    "src/master/Wordmark.logo.tsx",
    "src/master/Lockup.logo.tsx",
    "src/construction/construction.json",
    "src/construction/standard-grid.json",
    "src/construction/geometry.json",
    "src/variants/manifest.json",
    "build/master/mark.svg",
    "build/master/wordmark.svg",
    "build/master/lockup.svg"
  ]) if (!Object.prototype.hasOwnProperty.call(files, filePath)) findings.push(finding(filePath === "plan.contract.json" ? "PLAN_CONTRACT_MISSING" : "REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
}
function validateBriefAndSkillComposition(model, findings) {
  const brief = rec(parseJson(model.files, "plan.brief.json", findings, "BRIEF_INVALID"));
  const letterform = rec(brief?.letterform);
  if (!brief || brief.schema !== BRIEF_SCHEMA || brief.artifactId !== model.artifactId || ["brandName", "wordmarkText", "audience", "brandPositioning", "language", "scriptPolicy", "casePolicy"].some((key) => typeof brief[key] !== "string" || !String(brief[key]).trim()) || !["cjk-simplified", "cjk-traditional", "latin", "mixed", "other"].includes(String(brief.scriptPolicy)) || !["exact", "upper", "lower", "title", "not-applicable"].includes(String(brief.casePolicy)) || ["typeClass", "strokeProfile", "structure", "edgeFinish", "sceneReference"].some((key) => typeof letterform?.[key] !== "string" || !String(letterform[key]).trim()) || ["constraints", "prohibitedDirections", "successCriteria"].some((key) => !Array.isArray(brief[key]))) {
    findings.push(finding("BRIEF_INVALID", "plan.brief.json", "brief must bind exact wordmark copy, script/case policy, letterform dimensions, audience, positioning, constraints, prohibited directions, and success criteria"));
  }
  const context = rec(parseJson(model.files, "plan.context.json", findings, "BRAND_CONTEXT_INVALID"));
  const referenceRows = asList(context?.references);
  const references = referenceRows.map(rec).filter((entry) => entry !== void 0);
  if (!context || context.schema !== BRAND_CONTEXT_SCHEMA || context.artifactId !== model.artifactId || ["brandStory", "market", "differentiation"].some((key) => typeof context[key] !== "string" || String(context[key]).trim().length < 8) || !Array.isArray(context.competitors) || references.length === 0 || references.length !== referenceRows.length || references.some((entry) => typeof entry.id !== "string" || !entry.id || typeof entry.source !== "string" || !entry.source || !["provided", "licensed", "public-reference"].includes(String(entry.provenance)))) {
    findings.push(finding("BRAND_CONTEXT_INVALID", "plan.context.json", "brand context must bind story, market, differentiation, competitors, and traceable reference provenance"));
  }
  const assets = rec(parseJson(model.files, "plan.assets.json", findings, "ASSET_PLAN_INVALID"));
  const rawAssetRows = asList(assets?.assets);
  const assetRows = rawAssetRows.map(rec).filter((entry) => entry !== void 0);
  if (!assets || assets.schema !== ASSET_PLAN_SCHEMA || assets.artifactId !== model.artifactId || !Array.isArray(assets.assets) || assetRows.length !== rawAssetRows.length || assetRows.some((entry) => typeof entry.id !== "string" || !entry.id || typeof entry.kind !== "string" || !entry.kind || typeof entry.source !== "string" || !entry.source || !["provided", "licensed", "generated", "none"].includes(String(entry.provenance)))) {
    findings.push(finding("ASSET_PLAN_INVALID", "plan.assets.json", "asset plan must be valid JSON and record source/provenance for every input asset"));
  }
  const colorSystem = rec(parseJson(model.files, "plan.color-system.json", findings, "COLOR_SYSTEM_INVALID"));
  const tokens = rec(colorSystem?.tokens);
  const structuralRoles = rec(colorSystem?.structuralRoles);
  const rawScenarios = asList(colorSystem?.scenarios);
  const rawContrastPairs = asList(colorSystem?.contrastPairs);
  const rawProhibited = asList(colorSystem?.prohibitedCombinations);
  const scenarios = rawScenarios.map(rec).filter((entry) => entry !== void 0);
  const contrastPairs = rawContrastPairs.map(rec).filter((entry) => entry !== void 0);
  const prohibited = rawProhibited.map(rec).filter((entry) => entry !== void 0);
  const core = String(colorSystem?.core ?? "");
  const colorSystemInvalid = !colorSystem || colorSystem.schema !== COLOR_SYSTEM_SCHEMA || colorSystem.artifactId !== model.artifactId || Object.keys(tokens ?? {}).length < 4 || Object.values(tokens ?? {}).some((value) => !/^[a-f0-9]{6}$/iu.test(String(value))) || !core || !(core in (tokens ?? {})) || !["brand", "canvas", "text", "reverse"].every((role) => typeof structuralRoles?.[role] === "string" && String(structuralRoles[role]) in (tokens ?? {})) || scenarios.length === 0 || scenarios.length !== rawScenarios.length || scenarios.some((scenario) => {
    const roles = rec(scenario?.roles);
    return typeof scenario?.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(scenario.id) || scenario.core !== core || Object.keys(structuralRoles ?? {}).some((role) => typeof roles?.[role] !== "string" || !(String(roles[role]) in (tokens ?? {})));
  }) || contrastPairs.length === 0 || contrastPairs.length !== rawContrastPairs.length || contrastPairs.some((pair) => !(String(pair?.foreground) in (tokens ?? {})) || !(String(pair?.background) in (tokens ?? {})) || !Number.isFinite(pair?.minimum) || Number(pair.minimum) < 3) || prohibited.length === 0 || prohibited.length !== rawProhibited.length || prohibited.some((pair) => !(String(pair?.foreground) in (tokens ?? {})) || !(String(pair?.background) in (tokens ?? {})) || pair?.foreground === pair?.background || typeof pair?.reason !== "string" || !pair.reason.trim());
  if (colorSystemInvalid) findings.push(finding("COLOR_SYSTEM_INVALID", "plan.color-system.json", "color system must bind a stable core token, structural roles, valid scenarios, contrast pairs, and prohibited combinations"));
  const delivery = rec(parseJson(model.files, "plan.delivery-profile.json", findings, "DELIVERY_PROFILE_INVALID"));
  const transparentSizes = asList(delivery?.transparentPngSizes).map(Number);
  const faviconSizes = asList(delivery?.faviconSizes).map(Number);
  if (!delivery || delivery.schema !== DELIVERY_PROFILE_SCHEMA || delivery.artifactId !== model.artifactId || ![64, 128, 256, 512].every((size) => transparentSizes.includes(size)) || ![16, 32].every((size) => faviconSizes.includes(size)) || delivery.secondaryLayout !== "stacked" || delivery.specimen !== true || delivery.applicationMockup !== true || rec(delivery.print)?.guidance !== "CMYK-and-spot-color") {
    findings.push(finding("DELIVERY_PROFILE_INVALID", "plan.delivery-profile.json", "delivery profile must cover transparent PNG sizes, icons, secondary layout, specimen/mockup, and print guidance"));
  }
  const integration = rec(parseJson(model.files, "plan.integration.json", findings, "INTEGRATION_PLAN_INVALID"));
  const figma = rec(integration?.figma);
  if (!integration || integration.schema !== INTEGRATION_PLAN_SCHEMA || integration.artifactId !== model.artifactId || !["not-configured", "export-only", "writeback"].includes(String(figma?.mode)) || figma?.fallback !== "svg-import-package" || figma?.mode === "writeback" && (typeof figma.receiptPath !== "string" || !figma.receiptPath || !hasFile(model, figma.receiptPath))) {
    findings.push(finding("INTEGRATION_PLAN_INVALID", "plan.integration.json", "Figma integration must declare capability mode and the svg-import-package fallback; writeback also needs a receipt path"));
  }
  const composition = rec(parseJson(model.files, "plan.skill-composition.json", findings, "SKILL_COMPOSITION_INVALID"));
  const workers = asList(composition?.workers).map(rec).filter((worker) => worker !== void 0);
  let valid = composition?.schema === SKILL_COMPOSITION_SCHEMA && composition?.selectionPolicy === "dynamic-role-pool" && workers.length > 0 && new Set(workers.map((worker) => worker.name)).size === workers.length;
  for (const worker of workers) {
    const expected = EXTERNAL_SKILLS.find((entry) => entry.name === worker.name);
    const status = String(worker?.status ?? "");
    if (!expected || Object.hasOwn(worker, "revision") || worker.role !== expected.role || JSON.stringify(worker.languages) !== JSON.stringify(expected.languages) || worker.ecosystem !== expected.ecosystem || worker.mode !== expected.mode || !["used", "skipped", "unavailable"].includes(status) || typeof worker.reason !== "string" || !worker.reason.trim() || worker.advicePath !== `evidence/skills/${expected?.name ?? worker.name}.json`) valid = false;
    if (status === "used" && expected) {
      const advicePath = String(worker.advicePath);
      let advice;
      try {
        advice = rec(JSON.parse(textOf(model.files?.[advicePath])));
      } catch {
        advice = void 0;
      }
      if (!advice || Object.hasOwn(advice, "revision") || advice.schema !== SKILL_ADVICE_SCHEMA || advice.plugin !== PLUGIN || advice.artifactId !== model.artifactId || advice.skillName !== expected.name || advice.ecosystem !== expected.ecosystem || advice.mode !== expected.mode || !expected.phases.includes(advice.phase) || advice.subjectDigest !== computeLogoSubjectDigest(model) || !Array.isArray(advice.recommendations) || !Array.isArray(advice.adopted) || !Array.isArray(advice.rejected)) {
        findings.push(finding("SKILL_ADVICE_INVALID", advicePath, `used worker ${expected.name} requires current admitted advice evidence`));
      }
    }
  }
  if (!valid) findings.push(finding("SKILL_COMPOSITION_INVALID", "plan.skill-composition.json", "composition must select a truthful role-based subset of bundled bilingual advisers"));
  const used = workers.filter((worker) => worker.status === "used");
  if (used.length > 3) findings.push(finding("SKILL_COMPOSITION_ACTIVE_LIMIT", "plan.skill-composition.json", "at most three external workers may be used"));
  if (new Set(used.map((worker) => worker.advicePath)).size !== used.length) findings.push(finding("SKILL_COMPOSITION_INVALID", "plan.skill-composition.json", "used workers require distinct advice artifacts"));
}
function validatePlanAndProject(model, stage, findings) {
  const plan = parseJson(model.files, "plan.contract.json", findings, "PLAN_CONTRACT_INVALID");
  const planRecord = isObject(plan) ? plan : void 0;
  if (plan && (!planRecord || planRecord.schema !== PLAN_SCHEMA || planRecord.artifactId !== model.artifactId || !stageName(planRecord.targetStage))) findings.push(finding("PLAN_CONTRACT_INVALID", "plan.contract.json", "plan must bind schema, artifactId, and targetStage source|release"));
  if (!stageName(stage)) findings.push(finding("STAGE_INVALID", "plan.contract.json", "closure stage must be source or release"));
  else if ((isObject(plan) ? plan.targetStage : void 0) !== stage) findings.push(finding("PLAN_STAGE_MISMATCH", "plan.contract.json", "validated closure stage must match plan targetStage"));
  const project = parseJson(model.files, "logo.project.json", findings);
  const projectRecord = isObject(project) ? project : void 0;
  if (project && (!projectRecord || projectRecord.schema !== PROJECT_SCHEMA || projectRecord.artifactId !== model.artifactId || typeof projectRecord.selectedConcept !== "string" || !projectRecord.selectedConcept)) findings.push(finding("LOGO_PROJECT_INVALID", "logo.project.json", "project must bind schema, artifactId, and selectedConcept"));
}
function validateToolchain(files, findings) {
  const pkg = parseJson(files, "package.json", findings);
  const lock = parseJson(files, "package-lock.json", findings);
  const scripts = isObject(pkg) && isObject(pkg.scripts) ? pkg.scripts : void 0;
  const renderScript = scripts?.["logo:render"];
  if (pkg && (!isObject(pkg) || typeof renderScript !== "string" || !renderScript.trim())) findings.push(finding("RENDER_SCRIPT_MISSING", "package.json", "package.json scripts.logo:render is required"));
  if (lock && (!isObject(lock) || !Number.isInteger(lock.lockfileVersion) || !isObject(lock.packages))) findings.push(finding("PACKAGE_LOCK_INVALID", "package-lock.json", "npm lockfileVersion and packages map are required"));
}
function validateArtifactGitignore(files, findings) {
  const value = textOf(files[".gitignore"]);
  value.split(/\r?\n/u).forEach((raw, offset) => {
    const line = raw.trim();
    const normalized = line.replace(/^\//u, "");
    if (line && !line.startsWith("#") && !line.startsWith("!") && (/^(?:dist|build|evidence)(?:\/|$)/u.test(normalized) || /^(?:receipt|review|release)(?:\.|\/|$)/u.test(normalized) || /^(?:\*\*\/)?\*\.(?:png|svg)$/u.test(normalized))) findings.push(finding("DELIVERY_PATH_IGNORED", `.gitignore:${offset + 1}`, `artifact delivery path must not be ignored: ${line}`));
  });
}
function crc32(bytes) {
  let crc = 4294967295;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc >>> 1 ^ 3988292384 & -(crc & 1);
  }
  return (crc ^ 4294967295) >>> 0;
}
function pngValid(model, filePath) {
  const bytes = rawBytes(model, filePath);
  if (bytes.byteLength < 57 || !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return false;
  let offset = 8;
  let header = null;
  const idat = [];
  let ended = false;
  let palette = false;
  while (offset + 12 <= bytes.byteLength) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.byteLength - offset - 12) return false;
    const type = bytes.subarray(offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    if (crc32(Buffer.concat([type, data])) !== expectedCrc) return false;
    const name = type.toString("ascii");
    if (!header) {
      if (name !== "IHDR" || length !== 13) return false;
      header = data;
    } else if (name === "IHDR") return false;
    if (name === "IDAT") idat.push(data);
    if (name === "PLTE") palette = length > 0 && length % 3 === 0;
    if (name === "IEND") {
      if (length !== 0 || offset + 12 !== bytes.byteLength) return false;
      ended = true;
      break;
    }
    offset += 12 + length;
  }
  if (!header || idat.length === 0 || !ended) return false;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const depth = header.readUInt8(8);
  const colorType = header.readUInt8(9);
  const channels = (/* @__PURE__ */ new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]])).get(colorType);
  const depths = (/* @__PURE__ */ new Map([[0, [1, 2, 4, 8, 16]], [2, [8, 16]], [3, [1, 2, 4, 8]], [4, [8, 16]], [6, [8, 16]]])).get(colorType) ?? [];
  if (!width || !height || !channels || !depths.includes(depth) || colorType === 3 && !palette || header.readUInt8(10) !== 0 || header.readUInt8(11) !== 0 || header.readUInt8(12) !== 0) return false;
  const rowBytes = Math.ceil(width * channels * depth / 8) + 1;
  const expectedLength = rowBytes * height;
  if (!Number.isSafeInteger(expectedLength) || expectedLength > 128 * 1024 * 1024) return false;
  try {
    const inflated = inflateSync2(Buffer.concat(idat), { maxOutputLength: expectedLength });
    if (inflated.byteLength !== expectedLength) return false;
    for (let row = 0; row < height; row += 1) if ((inflated[row * rowBytes] ?? 0) > 4) return false;
    return true;
  } catch {
    return false;
  }
}
function pngInfo(model, filePath) {
  if (!pngValid(model, filePath)) return null;
  const bytes = rawBytes(model, filePath);
  const alpha = [4, 6].includes(bytes.readUInt8(25));
  try {
    const decoded = decodePngToRgba(bytes);
    let hasInk = false;
    let hasTransparency = false;
    for (let offset = 3; offset < decoded.rgba.length; offset += 4) {
      const value = decoded.rgba[offset] ?? 0;
      if (value > 0) hasInk = true;
      if (value < 255) hasTransparency = true;
      if (hasInk && hasTransparency) break;
    }
    return { width: decoded.width, height: decoded.height, alpha, hasInk, hasTransparency };
  } catch {
    return null;
  }
}
function svgWellFormed(svg) {
  const stack = [];
  let cursor = 0;
  let roots = 0;
  for (const match of svg.matchAll(/<\/?([A-Za-z][A-Za-z0-9]*)\b([^<>]*)>/gu)) {
    const index = match.index ?? 0;
    if (svg.slice(cursor, index).trim()) return false;
    const token = match[0];
    const name = match[1];
    const attrs = match[2] ?? "";
    const closing = token.startsWith("</");
    if (!name || !SVG_TAGS.has(name)) return false;
    if (closing) {
      if (attrs.trim() || stack.pop() !== name) return false;
    } else {
      const selfClosing = /\/\s*>$/u.test(token);
      const attributesText = attrs.replace(/\/\s*$/u, "");
      const attributes = [...attributesText.matchAll(/\s+([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"[^"]*"|'[^']*')/gu)];
      const names = attributes.map((attribute) => attribute[1]);
      const remainder = attributesText.replace(/\s+([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"[^"]*"|'[^']*')/gu, "").trim();
      if (remainder || new Set(names).size !== names.length) return false;
      if (stack.length === 0) {
        roots += 1;
        if (name !== "svg") return false;
      }
      if (!selfClosing) stack.push(name);
    }
    cursor = index + token.length;
  }
  return roots === 1 && stack.length === 0 && !svg.slice(cursor).trim();
}
function svgAttributes(text) {
  return new Map([...text.matchAll(/\b([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*["']([^"']*)["']/gu)].flatMap((match) => {
    const name = match[1];
    const value = match[2];
    return name === void 0 || value === void 0 ? [] : [[name, value]];
  }));
}
function finiteNumber(value, { positive = false } = {}) {
  if (typeof value !== "string" || !value.trim()) return false;
  const number = Number(value);
  return Number.isFinite(number) && (!positive || number > 0);
}
function isPathCommand(value) {
  return Object.prototype.hasOwnProperty.call(PATH_ARITY, value);
}
function pathDataValid(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const tokenPattern = /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][-+]?\d+)?/gu;
  const tokens = [...value.matchAll(tokenPattern)].map((match) => match[0]);
  if (!tokens.length || value.replace(tokenPattern, "").replace(/[\s,]+/gu, "")) return false;
  const commandPattern = /^[AaCcHhLlMmQqSsTtVvZz]$/u;
  let cursor = 0;
  let command = null;
  let drawable = false;
  while (cursor < tokens.length) {
    const head = tokens[cursor];
    if (head !== void 0 && commandPattern.test(head)) {
      const next = head.toUpperCase();
      command = isPathCommand(next) ? next : null;
      cursor += 1;
      if (command === "Z") {
        command = null;
        continue;
      }
    }
    if (!command) return false;
    const values = [];
    while (cursor < tokens.length) {
      const token = tokens[cursor];
      if (token === void 0 || commandPattern.test(token)) break;
      const number = Number(token);
      if (!Number.isFinite(number)) return false;
      values.push(number);
      cursor += 1;
    }
    const size = PATH_ARITY[command];
    if (values.length < size || values.length % size !== 0) return false;
    if (command === "A") for (let offset = 0; offset < values.length; offset += size) {
      const rx = values[offset];
      const ry = values[offset + 1];
      const largeArc = values[offset + 3];
      const sweep = values[offset + 4];
      if (!(rx !== void 0 && rx > 0) || !(ry !== void 0 && ry > 0) || largeArc === void 0 || sweep === void 0 || ![0, 1].includes(largeArc) || ![0, 1].includes(sweep)) return false;
    }
    if (command !== "M" || values.length > size) drawable = true;
  }
  return drawable;
}
function vectorGeometryValid(svg) {
  const elements = [...svg.matchAll(/<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)>/gu)];
  if (elements.length === 0) return false;
  return elements.every(([, name, raw]) => {
    if (!name || raw === void 0) return false;
    const attributes = svgAttributes(raw);
    if (name === "path") return pathDataValid(attributes.get("d"));
    if (name === "circle") return finiteNumber(attributes.get("r"), { positive: true });
    if (name === "ellipse") return finiteNumber(attributes.get("rx"), { positive: true }) && finiteNumber(attributes.get("ry"), { positive: true });
    if (name === "rect") return finiteNumber(attributes.get("width"), { positive: true }) && finiteNumber(attributes.get("height"), { positive: true });
    if (name === "line") {
      const coordinates = ["x1", "y1", "x2", "y2"].map((key) => attributes.get(key));
      return coordinates.every((coordinate) => finiteNumber(coordinate)) && (coordinates[0] !== coordinates[2] || coordinates[1] !== coordinates[3]);
    }
    const points = attributes.get("points") ?? "";
    const numbers = points.trim().split(/[\s,]+/u);
    const minimum = name === "polygon" ? 6 : 4;
    return numbers.length >= minimum && numbers.length % 2 === 0 && numbers.every((number) => finiteNumber(number));
  });
}
function svgValid(value, { sheet = null, masterDigest = null } = {}) {
  const svg = textOf(value).trim();
  if (!/^<svg\b[^>]*\bviewBox\s*=/.test(svg) || !/<\/svg>$/u.test(svg) || !svgWellFormed(svg) || FORBIDDEN_SVG.test(svg) || !VECTOR_ELEMENT.test(svg) || !vectorGeometryValid(svg)) return false;
  if (sheet && (!svg.includes(`data-construction-sheet="${sheet}"`) || !svg.includes(`data-master-digest="${masterDigest}"`))) return false;
  return true;
}
function svgPrimitiveIds(value) {
  const ids = /* @__PURE__ */ new Set();
  for (const match of textOf(value).matchAll(/<(?:path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)>/gu)) {
    const attrs = match[1] ?? "";
    const id = attrs.match(/\bid\s*=\s*["']([^"']+)["']/u)?.[1];
    if (id) ids.add(id);
  }
  return ids;
}
function geometrySignature(value) {
  const svg = textOf(value);
  const elements = [...svg.matchAll(/<(svg|g|path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)>/gu)].map((match) => {
    const rawAttrs = match[2] ?? "";
    const attributes = [...rawAttrs.matchAll(/\b([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*["']([^"']*)["']/gu)].filter((attribute) => {
      const name = attribute[1];
      return name !== void 0 && !["xmlns", "fill", "color"].includes(name) && !name.startsWith("aria-") && !name.startsWith("data-");
    }).map((attribute) => {
      const name = attribute[1] ?? "";
      const raw = (attribute[2] ?? "").trim().replace(/\s+/gu, " ");
      const normalized = name === "stroke" ? raw === "none" ? "none" : "paint" : raw;
      return `${name}=${normalized}`;
    }).sort().join(";");
    return `${match[1]}:${attributes}`;
  });
  return elements.join("|");
}
function rec(value) {
  return isObject(value) ? value : void 0;
}
function asList(value) {
  return Array.isArray(value) ? value : [];
}
function validateConcepts(model, findings) {
  const manifest = parseJson(model.files, "src/concepts/manifest.json", findings);
  const concepts = asList(rec(manifest)?.concepts);
  let project = null;
  try {
    project = JSON.parse(textOf(model.files?.["logo.project.json"]));
  } catch {
  }
  const selectedConcept = rec(project)?.selectedConcept;
  const ids = concepts.map((entry) => rec(entry)?.id);
  const sources = concepts.map((entry) => rec(entry)?.source);
  const buckets = concepts.map((entry) => rec(entry)?.bucket);
  if (concepts.length === 0 || new Set(ids).size !== ids.length || new Set(sources).size !== sources.length || concepts.filter((entry) => rec(entry)?.id === selectedConcept).length !== 1) findings.push(finding("CONCEPT_MANIFEST_INVALID", "src/concepts/manifest.json", "concept ids and sources must be unique, ordered, and select exactly the project concept"));
  if (concepts.length < CONCEPT_BUCKETS.length || !CONCEPT_BUCKETS.every((bucket) => buckets.includes(bucket))) findings.push(finding("CONCEPT_DIVERGENCE_INSUFFICIENT", "src/concepts/manifest.json", `at least six concepts must cover distinct buckets: ${CONCEPT_BUCKETS.join(", ")}`));
  concepts.forEach((entry, offset) => {
    const item = rec(entry);
    const match = typeof item?.source === "string" ? item.source.match(CONCEPT_SOURCE) : null;
    const sourcePath = `src/concepts/${item?.source ?? "manifest.json"}`;
    if (!match || typeof item?.id !== "string" || !item.id || item.index !== offset + 1 || Number(match.groups?.index) !== item.index || !CONCEPT_BUCKETS.includes(String(item.bucket)) || typeof item.rationale !== "string" || item.rationale.trim().length < 12) {
      findings.push(finding("CONCEPT_SEQUENCE_INVALID", sourcePath, "concepts must use ids and contiguous NNN-slug.logo.tsx sources"));
      return;
    }
    if (!hasFile(model, sourcePath)) {
      findings.push(finding("CONCEPT_SOURCE_MISSING", sourcePath, "concept source is missing"));
      return;
    }
    const preview = `src/concepts/${String(item.source).slice(0, -9)}.${fileDigest(model, sourcePath)}.png`;
    if (!hasFile(model, preview)) findings.push(finding("CONCEPT_PREVIEW_MISSING", preview, "current source-hash concept preview is required"));
    else if (!pngValid(model, preview)) findings.push(finding("CONCEPT_PREVIEW_INVALID", preview, "concept preview must be a decodable PNG header with positive dimensions"));
  });
  const selection = rec(parseJson(model.files, "plan.concept-selection.json", findings, "CONCEPT_SELECTION_EVIDENCE_INVALID"));
  const rounds = asList(selection?.rounds).map(rec).filter((entry) => entry !== void 0);
  const firstIds = asList(rounds[0]?.conceptIds);
  const lastIds = asList(rounds.at(-1)?.conceptIds);
  if (!selection || selection.schema !== CONCEPT_SELECTION_SCHEMA || selection.artifactId !== model.artifactId || selection.selectedConcept !== selectedConcept || rounds.length < 2 || rounds.some((round, index) => round.round !== index + 1 || typeof round.feedback !== "string" || round.feedback.trim().length < 12) || ids.some((id) => !firstIds.includes(id)) || !lastIds.includes(selectedConcept)) {
    findings.push(finding("CONCEPT_SELECTION_EVIDENCE_INVALID", "plan.concept-selection.json", "selection evidence must record at least two ordered feedback rounds from all divergent concepts to the selected concept"));
  }
}
function validateMaster(model, findings) {
  for (const [index, displayRole] of ["Mark", "Wordmark", "Lockup"].entries()) {
    const filePath = `src/master/${displayRole}.logo.tsx`;
    const source = textOf(model.files?.[filePath]);
    if (!source) continue;
    const exports = source.match(/export\s+function\s+[A-Za-z][A-Za-z0-9]*\s*\(/gu) ?? [];
    if (MASTER_VECTOR_VIOLATION.test(source) || !new RegExp(`export\\s+function\\s+${displayRole}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*return\\s*\\(?\\s*<svg\\b`, "u").test(source)) findings.push(finding("MASTER_VECTOR_VIOLATION", filePath, "master role must be its named self-contained native-vector SVG component"));
    if (exports.length !== 1) findings.push(finding("MASTER_EXPORT_INVALID", filePath, "master role must export exactly one SVG component"));
    const role = ROLES[index];
    const builtPath = `build/master/${role}.svg`;
    if (hasFile(model, builtPath) && !svgValid(model.files?.[builtPath])) findings.push(finding("MASTER_SVG_INVALID", builtPath, "built master must be a self-contained non-empty SVG with viewBox"));
  }
}
function validateWordmarkManifest(model, findings) {
  const brief = rec(parseJson(model.files, "plan.brief.json", findings, "BRIEF_INVALID"));
  const manifest = rec(parseJson(model.files, "src/master/wordmark.manifest.json", findings, "WORDMARK_MANIFEST_INVALID"));
  const rawUnits = asList(manifest?.units);
  const units = rawUnits.map(rec).filter((entry) => entry !== void 0);
  const availablePathIds = svgPrimitiveIds(model.files?.["build/master/wordmark.svg"]);
  const claimedPathIds = /* @__PURE__ */ new Set();
  let valid = Boolean(manifest) && manifest?.schema === WORDMARK_MANIFEST_SCHEMA && manifest?.artifactId === model.artifactId && manifest?.text === brief?.wordmarkText && manifest?.scriptPolicy === brief?.scriptPolicy && units.length > 0 && units.length === rawUnits.length && units.map((unit) => String(unit.text ?? "")).join("") === manifest?.text;
  for (const [offset, unit] of units.entries()) {
    const pathIds = asList(unit.pathIds).map(String);
    if (unit.index !== offset + 1 || typeof unit.text !== "string" || !unit.text || pathIds.length === 0 || pathIds.some((id) => !availablePathIds.has(id) || claimedPathIds.has(id))) valid = false;
    for (const id of pathIds) claimedPathIds.add(id);
  }
  if (!valid) findings.push(finding("WORDMARK_MANIFEST_INVALID", "src/master/wordmark.manifest.json", "wordmark manifest must bind exact brief copy and script policy to unique current master path ids"));
}
function validateFibonacciConstruction(model, findings) {
  const path = "src/construction/fibonacci.json";
  const fibonacci = parseJson(model.files, path, findings);
  if (!fibonacci) return;
  const fib = rec(fibonacci) ?? {};
  if (JSON.stringify(fib.sequence) !== JSON.stringify(FIB_SEQUENCE)) {
    findings.push(finding("FIBONACCI_SEQUENCE_INVALID", path, "Fibonacci sequence must be 1,1,2,3,5,8,13"));
  }
  if (!(/* @__PURE__ */ new Set(["structural", "optical-reference"])).has(fib.usage)) {
    findings.push(finding("FIBONACCI_USAGE_INVALID", path, "Fibonacci usage must be structural or optical-reference"));
  }
  const unit = Number(fib.unit);
  const tolPx = Number(fib.tolerancePx ?? 1.5);
  const tolRatio = Number(fib.toleranceRatio ?? 0.08);
  if (!(unit > 0) || !Number.isFinite(unit)) {
    findings.push(finding("FIBONACCI_UNIT_INVALID", path, "fibonacci.unit must be a positive number (base radius)"));
  }
  if (!(tolPx > 0) || !(tolRatio > 0 && tolRatio < 0.5)) {
    findings.push(finding("FIBONACCI_TOLERANCE_INVALID", path, "tolerancePx must be > 0 and toleranceRatio in (0, 0.5)"));
  }
  const circles = asList(fib.circles);
  if (circles.length < 3) {
    findings.push(finding("FIBONACCI_CIRCLES_MISSING", path, "formal construction requires at least three named Fibonacci circles"));
  }
  const byId = /* @__PURE__ */ new Map();
  for (const circle of circles) {
    const item = rec(circle);
    if (!item || typeof item.id !== "string" || !item.id) {
      findings.push(finding("FIBONACCI_CIRCLE_INVALID", path, "each circle needs a non-empty id"));
      continue;
    }
    if (byId.has(item.id)) findings.push(finding("FIBONACCI_CIRCLE_INVALID", path, `duplicate circle id ${item.id}`));
    const cx = Number(item.cx);
    const cy = Number(item.cy);
    const radiusUnits = Number(item.radiusUnits);
    if (![cx, cy, radiusUnits].every(Number.isFinite)) {
      findings.push(finding("FIBONACCI_CIRCLE_INVALID", path, `circle ${item.id} needs numeric cx, cy, radiusUnits`));
      continue;
    }
    if (!FIB_SEQUENCE.includes(radiusUnits)) {
      findings.push(finding("FIBONACCI_RADIUS_NOT_IN_SEQUENCE", path, `circle ${item.id} radiusUnits=${radiusUnits} is not in 1,1,2,3,5,8,13`));
    }
    byId.set(item.id, { id: item.id, cx, cy, radiusUnits, r: radiusUnits * (unit > 0 ? unit : 1) });
  }
  const unitSet = [...new Set([...byId.values()].map((c) => c.radiusUnits))].sort((a, b) => a - b);
  let hasAdjacentPair = false;
  for (let i = 0; i < unitSet.length; i += 1) {
    for (let j = i + 1; j < unitSet.length; j += 1) {
      const left = unitSet[i];
      const right = unitSet[j];
      if (left === void 0 || right === void 0) continue;
      if (fibAdjacent(left, right)) {
        hasAdjacentPair = true;
        const larger = Math.max(left, right);
        const smaller = Math.min(left, right);
        const ratio = expectedRatio(larger, smaller);
        const expected = larger === smaller ? 1 : larger / smaller;
        if (ratio != null && Math.abs(ratio - expected) > 1e-9) {
        }
        void expected;
      }
    }
  }
  if (circles.length >= 2 && !hasAdjacentPair) {
    findings.push(finding("FIBONACCI_RATIO_PAIR_MISSING", path, "circles must include at least one adjacent Fibonacci radius pair (e.g. 5+8 or 8+13)"));
  }
  const spiral = rec(fib.spiral);
  const orderedIds = spiral && Array.isArray(spiral.orderedCircleIds) ? spiral.orderedCircleIds : null;
  if (!spiral || spiral.kind !== "fibonacci-quarter-arcs" || !orderedIds || orderedIds.length < 3) {
    findings.push(finding("FIBONACCI_SPIRAL_INVALID", path, "spiral.kind must be fibonacci-quarter-arcs with orderedCircleIds length \u2265 3"));
  } else {
    const ordered = orderedIds.map((id) => byId.get(id)).filter((value) => Boolean(value));
    if (ordered.length >= 2) {
      let maxCenterDist = 0;
      for (let i = 0; i < ordered.length; i += 1) {
        for (let j = i + 1; j < ordered.length; j += 1) {
          const left = ordered[i];
          const right = ordered[j];
          if (!left || !right) continue;
          maxCenterDist = Math.max(maxCenterDist, Math.hypot(left.cx - right.cx, left.cy - right.cy));
        }
      }
      if (maxCenterDist <= tolPx) {
        findings.push(finding("FIBONACCI_SPIRAL_CONCENTRIC", path, "spiral circles must not be concentric; quarter-arc construction needs offset joint centers"));
      }
    }
    for (let i = 0; i < orderedIds.length - 1; i += 1) {
      const a = byId.get(orderedIds[i]);
      const b = byId.get(orderedIds[i + 1]);
      if (!a || !b) {
        findings.push(finding("FIBONACCI_SPIRAL_INVALID", path, `spiral references unknown circle at index ${i}`));
        continue;
      }
      if (!fibAdjacent(a.radiusUnits, b.radiusUnits)) {
        findings.push(finding("FIBONACCI_SPIRAL_STEP_INVALID", path, `spiral step ${a.id}\u2192${b.id} radii ${a.radiusUnits},${b.radiusUnits} are not adjacent Fibonacci units`));
      }
      const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      const internal = Math.abs(a.r - b.r);
      const external = a.r + b.r;
      const okInternal = Math.abs(dist - internal) <= tolPx && dist > tolPx;
      const okExternal = Math.abs(dist - external) <= tolPx;
      if (!okInternal && !okExternal) {
        findings.push(finding("FIBONACCI_SPIRAL_GEOMETRY_INVALID", path, `spiral ${a.id}\u2192${b.id}: center distance ${dist.toFixed(2)} must equal |r1\u2212r2|=${internal.toFixed(2)} or r1+r2=${external.toFixed(2)} (quarter-arc joint)`));
      }
    }
    if (Array.isArray(spiral.arcs) && spiral.arcs.length > 0) {
      for (const arc of spiral.arcs) {
        const arcRec = rec(arc);
        if (!byId.has(arcRec?.circleId)) {
          findings.push(finding("FIBONACCI_SPIRAL_ARC_INVALID", path, `spiral.arcs references unknown circle ${arcRec?.circleId}`));
          continue;
        }
        const sweep = Math.abs(Number(arcRec?.endAngleDeg) - Number(arcRec?.startAngleDeg));
        const norm = (sweep % 360 + 360) % 360;
        if (Math.abs(norm - 90) > 1 && Math.abs(norm - 270) > 1) {
          findings.push(finding("FIBONACCI_SPIRAL_ARC_INVALID", path, `spiral arc on ${arcRec?.circleId} must be a quarter turn (90\xB0), got ${sweep}\xB0`));
        }
      }
    }
  }
  const bindings = asList(fib.pathBindings);
  const outlineBindings = bindings.filter((b) => rec(b)?.role === "outline");
  const voidBindings = bindings.filter((b) => rec(b)?.role === "negative-space" || rec(b)?.role === "turn");
  if (outlineBindings.length < 2 || voidBindings.length < 1) {
    findings.push(finding("FIBONACCI_PATH_BINDINGS_INVALID", path, "pathBindings need \u22652 outline and \u22651 negative-space|turn roles bound to circles"));
  }
  for (const binding of bindings) {
    const item = rec(binding);
    if (!byId.has(item?.circleId)) {
      findings.push(finding("FIBONACCI_PATH_BINDINGS_INVALID", path, `pathBinding references unknown circleId ${item?.circleId}`));
    }
    if (!["center", "rim"].includes(item?.feature)) {
      findings.push(finding("FIBONACCI_PATH_BINDINGS_INVALID", path, "pathBinding.feature must be center or rim"));
    }
  }
  const anchors = asList(fib.anchors);
  if (anchors.length > 0) {
    if (anchors.filter((anchor) => rec(anchor)?.kind === "outline").length < 2 || anchors.filter((anchor) => rec(anchor)?.kind === "negative-space" || rec(anchor)?.kind === "turn").length < 1) {
      findings.push(finding("FIBONACCI_ANCHORS_INVALID", path, "when anchors are present, need two outline and one negative-space|turn"));
    }
  }
  const geometry = parseJson(model.files, "src/construction/geometry.json", findings);
  const geometryRec = rec(geometry);
  if (geometry) {
    const primitives = asList(geometryRec?.primitives);
    const circlePrims = primitives.filter((p) => rec(p)?.type === "circle" && typeof rec(p)?.id === "string");
    for (const id of byId.keys()) {
      if (!circlePrims.some((p) => rec(p)?.id === id)) {
        findings.push(finding("FIBONACCI_GEOMETRY_PRIMITIVE_MISSING", "src/construction/geometry.json", `geometry.primitives must include circle id ${id}`));
      }
    }
    if (!Array.isArray(geometryRec?.pathMappings) || asList(geometryRec?.pathMappings).length === 0) {
      findings.push(finding("GEOMETRY_MAPPING_INVALID", "src/construction/geometry.json", "geometry must map master paths to stable primitives"));
    }
  }
  const markSvg = model.files?.["build/master/mark.svg"];
  const svgCircles = extractSvgCircles(markSvg);
  const pathPoints = extractSvgPathPoints(markSvg);
  if (byId.size > 0 && svgCircles.length === 0 && pathPoints.length === 0) {
    findings.push(finding("FIBONACCI_MARK_GEOMETRY_MISSING", "build/master/mark.svg", "mark master must contain circle elements or path points realizing the Fibonacci construction"));
  }
  for (const declared of byId.values()) {
    const matchCircle = svgCircles.some((s) => Math.hypot(s.cx - declared.cx, s.cy - declared.cy) <= tolPx && Math.abs(s.r - declared.r) <= tolPx);
    if (matchCircle) continue;
    const rimHit = pathPoints.some((p) => Math.abs(Math.hypot(p.x - declared.cx, p.y - declared.cy) - declared.r) <= tolPx);
    const centerHit = pathPoints.some((p) => Math.hypot(p.x - declared.cx, p.y - declared.cy) <= tolPx);
    if (!rimHit && !centerHit) {
      findings.push(finding("FIBONACCI_MARK_CIRCLE_UNREALIZED", "build/master/mark.svg", `declared circle ${declared.id} (r=${declared.r}) is not realized in mark SVG geometry`));
    }
  }
  for (const binding of bindings) {
    const item = rec(binding);
    const circle = byId.get(item?.circleId);
    if (!circle) continue;
    if (item?.feature === "center") {
      const ok = svgCircles.some((s) => Math.hypot(s.cx - circle.cx, s.cy - circle.cy) <= tolPx) || pathPoints.some((p) => Math.hypot(p.x - circle.cx, p.y - circle.cy) <= tolPx);
      if (!ok) findings.push(finding("FIBONACCI_BINDING_CENTER_MISS", "build/master/mark.svg", `outline/void center binding for ${circle.id} not found near (${circle.cx},${circle.cy})`));
    }
    if (item?.feature === "rim") {
      const ok = svgCircles.some((s) => Math.hypot(s.cx - circle.cx, s.cy - circle.cy) <= tolPx && Math.abs(s.r - circle.r) <= tolPx) || pathPoints.some((p) => Math.abs(Math.hypot(p.x - circle.cx, p.y - circle.cy) - circle.r) <= tolPx);
      if (!ok) findings.push(finding("FIBONACCI_BINDING_RIM_MISS", "build/master/mark.svg", `rim binding for ${circle.id} not found on circumference r=${circle.r}`));
    }
  }
  const sorted = [...byId.values()].sort((a, b) => a.radiusUnits - b.radiusUnits);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!a || !b || !fibAdjacent(a.radiusUnits, b.radiusUnits) || a.radiusUnits === b.radiusUnits) continue;
    const ratio = b.r / a.r;
    const ideal = b.radiusUnits / a.radiusUnits;
    if (Math.abs(ratio - ideal) > tolRatio * ideal) {
      findings.push(finding("FIBONACCI_RADIUS_RATIO_INVALID", path, `radius ratio ${b.id}/${a.id}=${ratio.toFixed(4)} diverges from Fib ${ideal}`));
    }
    if (a.radiusUnits === 5 && b.radiusUnits === 8 || a.radiusUnits === 8 && b.radiusUnits === 13) {
      if (Math.abs(ratio - PHI) > 0.12) {
        findings.push(finding("FIBONACCI_PHI_RATIO_WEAK", path, `pair ${a.radiusUnits}:${b.radiusUnits} ratio ${ratio.toFixed(4)} is far from \u03C6\u22481.618`));
      }
    }
  }
}
function validateConstruction(model, findings) {
  const construction = parseJson(model.files, "src/construction/construction.json", findings);
  const standard = parseJson(model.files, "src/construction/standard-grid.json", findings);
  const geometry = parseJson(model.files, "src/construction/geometry.json", findings);
  const method = rec(construction)?.method;
  const fibonacci = method === "fibonacci" ? parseJson(model.files, "src/construction/fibonacci.json", findings) : null;
  const digest = masterSubjectDigest(model);
  if (!isObject(construction) || construction.schema !== CONSTRUCTION_SCHEMA || !CONSTRUCTION_METHODS.has(String(construction.method)) || typeof construction.rationale !== "string" || construction.rationale.trim().length < 12 || !(Number(construction.tolerance) >= 0) || !(Number(construction.maxOpticalCorrection) >= 0)) findings.push(finding("CONSTRUCTION_CONFIG_INVALID", "src/construction/construction.json", "construction config must declare a supported method, rationale, and non-negative tolerances"));
  if (!isObject(standard) || standard.schema !== STANDARD_GRID_SCHEMA || standard.masterDigest !== digest || !(Number(standard.unit) > 0) || !(Number(standard.clearSpace) > 0) || !(Number(standard.minimumPixels) > 0)) findings.push(finding("STANDARD_GRID_INVALID", "src/construction/standard-grid.json", "standard grid must bind current master and use positive unit, clear space, and minimum size"));
  const geometryRec = rec(geometry);
  const primitives = asList(geometryRec?.primitives);
  const mappings = asList(geometryRec?.pathMappings);
  const primitiveIds = /* @__PURE__ */ new Set();
  let geometryValid = isObject(geometry) && geometry.schema === GEOMETRY_SCHEMA && geometry.masterDigest === digest && primitives.length > 0 && mappings.length >= ROLES.length;
  for (const primitive of primitives) {
    const item = rec(primitive);
    const parameters = isObject(item?.parameters) ? Object.values(item.parameters) : [];
    if (!item || typeof item.id !== "string" || !item.id || primitiveIds.has(item.id) || typeof item.type !== "string" || !PRIMITIVE_TYPES.has(item.type) || parameters.length === 0 || parameters.some((value) => typeof value !== "number" || !Number.isFinite(value))) geometryValid = false;
    else primitiveIds.add(item.id);
  }
  const mappingKeys = /* @__PURE__ */ new Set();
  const mappingPrimitives = /* @__PURE__ */ new Map();
  for (const mapping of mappings) {
    const item = rec(mapping);
    const masterIds = svgPrimitiveIds(model.files?.[`build/master/${item?.role}.svg`]);
    const key = `${item?.role}:${item?.pathId}`;
    const primitiveIdList = asList(item?.primitiveIds);
    if (typeof item?.role !== "string" || !ROLES.includes(item.role) || typeof item?.pathId !== "string" || !masterIds.has(item.pathId) || !Array.isArray(item?.primitiveIds) || primitiveIdList.length === 0 || new Set(primitiveIdList).size !== primitiveIdList.length || primitiveIdList.some((id) => !primitiveIds.has(id)) || mappingKeys.has(key)) geometryValid = false;
    else {
      mappingKeys.add(key);
      mappingPrimitives.set(key, new Set(primitiveIdList));
    }
  }
  if (ROLES.some((role) => !mappings.some((mapping) => rec(mapping)?.role === role))) geometryValid = false;
  if (!geometryValid) findings.push(finding("GEOMETRY_MAPPING_INVALID", "src/construction/geometry.json", "geometry must bind current master ids to unique, numeric stable primitives for every role"));
  if (method === "fibonacci") {
    const sequence = [1, 1, 2, 3, 5, 8, 13];
    const anchors = asList(rec(fibonacci)?.anchors);
    const anchorIds = /* @__PURE__ */ new Set();
    let fibonacciValid = isObject(fibonacci) && fibonacci.schema === FIBONACCI_SCHEMA && fibonacci.masterDigest === digest && JSON.stringify(fibonacci.sequence) === JSON.stringify(sequence) && (/* @__PURE__ */ new Set(["structural", "optical-reference"])).has(fibonacci.usage);
    for (const anchor of anchors) {
      const item = rec(anchor);
      const key = `${item?.role}:${item?.pathId}`;
      if (!item || typeof item.id !== "string" || !item.id || anchorIds.has(item.id) || !mappingKeys.has(key) || !mappingPrimitives.get(key)?.has(item.primitiveId) || !["outline", "negative-space", "turn"].includes(item.kind) || !Number.isFinite(item.x) || !Number.isFinite(item.y) || !sequence.includes(item.sequenceValue)) fibonacciValid = false;
      else anchorIds.add(item.id);
    }
    if (anchors.filter((anchor) => rec(anchor)?.kind === "outline").length < 2 || anchors.filter((anchor) => rec(anchor)?.kind === "negative-space" || rec(anchor)?.kind === "turn").length < 1) fibonacciValid = false;
    if (!fibonacciValid) findings.push(finding("FIBONACCI_ANCHORS_INVALID", "src/construction/fibonacci.json", "Fibonacci anchors must bind coordinates and sequence values to mapped current-master paths"));
  }
  for (const sheet of constructionSheetNames(model)) for (const extension of ["svg", "png"]) {
    const filePath = `evidence/construction/${sheet}.${digest}.${extension}`;
    if (!hasFile(model, filePath)) findings.push(finding("CONSTRUCTION_SHEET_MISSING", filePath, `${sheet} ${extension.toUpperCase()} sheet must bind the current master digest`));
    else if (extension === "svg" ? !svgValid(model.files?.[filePath], { sheet, masterDigest: digest }) : !pngValid(model, filePath)) findings.push(finding("CONSTRUCTION_SHEET_INVALID", filePath, `${sheet} sheet must be a valid bound ${extension.toUpperCase()}`));
  }
  const manifestPath = `evidence/construction/manifest.${digest}.json`;
  if (!hasFile(model, manifestPath)) findings.push(finding("CONSTRUCTION_MANIFEST_MISSING", manifestPath, "construction manifest is required"));
  else if (!exactJson(model.files?.[manifestPath], createConstructionManifest(model))) findings.push(finding("CONSTRUCTION_MANIFEST_INVALID", manifestPath, "construction manifest must bind current master and sheet bytes"));
  if (method === "fibonacci") validateFibonacciConstruction(model, findings);
}
function samplesFromManifest(manifest) {
  const record = rec(manifest);
  if (Array.isArray(record?.samples)) return record.samples;
  if (Array.isArray(record?.cells)) {
    return record.cells.map((cell, index) => {
      const item = rec(cell) ?? {};
      const locator = rec(item.locator);
      return {
        id: item.id ?? `cell-${index}`,
        row: item.row,
        size: item.size,
        locator: { bbox: item.bbox ?? locator?.bbox, region: item.region ?? locator?.region }
      };
    });
  }
  return [];
}
function validatePreviewAndAesthetic(model, findings) {
  const digest = masterSubjectDigest(model);
  const stripPath = `evidence/preview/strip.${digest}.png`;
  const manifestPath = `evidence/preview/strip.${digest}.manifest.json`;
  const squintPath = `evidence/preview/squint.${digest}.json`;
  if (!hasFile(model, stripPath)) findings.push(finding("PREVIEW_STRIP_MISSING", stripPath, "multi-size preview strip PNG bound to master digest is required for release"));
  else if (!pngValid(model, stripPath)) findings.push(finding("PREVIEW_STRIP_INVALID", stripPath, "preview strip must be a valid PNG"));
  const manifest = parseJson(model.files, manifestPath, findings);
  const manifestRec = rec(manifest);
  const samples = samplesFromManifest(manifest);
  if (manifest) {
    const sizes = new Set(samples.map((sample) => Number(sample.size)).filter(Number.isFinite));
    for (const need of [16, 32, 64]) if (!sizes.has(need)) findings.push(finding("PREVIEW_STRIP_SIZES_INVALID", manifestPath, `preview strip must include ${need}px samples`));
    const rows = new Set(samples.map((sample) => sample.row).filter(Boolean));
    if (!(rows.has("black") || rows.has("mono")) || !rows.has("reverse")) findings.push(finding("PREVIEW_STRIP_ROWS_INVALID", manifestPath, "preview strip samples must include black|mono and reverse rows"));
    for (const sample of samples) {
      const bbox = sample?.locator?.bbox;
      if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => !Number.isFinite(Number(value)))) findings.push(finding("PREVIEW_STRIP_BBOX_INVALID", manifestPath, `sample ${sample?.id ?? "?"} missing locator.bbox[4]`));
    }
    if (samples.length > 1 && samples.every((sample) => Number(sample?.locator?.bbox?.[0]) === 0 && Number(sample?.locator?.bbox?.[1]) === 0)) findings.push(finding("PREVIEW_STRIP_BBOX_FABRICATED", manifestPath, "sample bboxes must come from the rendered strip"));
    const artifact = rec(manifestRec?.artifact);
    const claimed = artifact?.sha256 ?? manifestRec?.pngSha256 ?? manifestRec?.stripDigest ?? manifestRec?.sha256;
    if (typeof claimed !== "string" || claimed !== fileDigest(model, stripPath)) findings.push(finding("PREVIEW_STRIP_DIGEST_MISMATCH", manifestPath, "manifest strip digest must match strip PNG bytes"));
    if (manifestRec?.masterDigest !== digest) findings.push(finding("PREVIEW_STRIP_MASTER_STALE", manifestPath, "preview manifest masterDigest must match current master digest"));
  }
  const squint = parseJson(model.files, squintPath, findings);
  const squintRec = rec(squint);
  if (squint) {
    if (squintRec?.masterDigest !== digest) findings.push(finding("SQUINT_MASTER_STALE", squintPath, "squint evidence masterDigest must match current masters"));
    if (squintRec?.stripDigest !== fileDigest(model, stripPath)) findings.push(finding("SQUINT_STRIP_DIGEST_MISMATCH", squintPath, "squint.stripDigest must equal the preview strip PNG digest"));
    if (squintRec?.method !== "box-blur-threshold-connected-components") findings.push(finding("SQUINT_METHOD_INVALID", squintPath, "squint.method must use measured connected-component analysis"));
    if (squintRec?.pass !== true) findings.push(finding("SQUINT_FAILED", squintPath, "squint observation must pass"));
    const cells = asList(squintRec?.cells);
    const sizes = new Set(cells.map((cell) => Number(rec(cell)?.size)));
    for (const need of [16, 32, 64]) if (!sizes.has(need)) findings.push(finding("SQUINT_CELLS_INCOMPLETE", squintPath, `squint cells must cover ${need}px`));
    for (const cell of cells) {
      const item = rec(cell) ?? {};
      if (typeof item.silhouetteIntact !== "boolean" || !(Number(item.primaryShare) >= 0) || !(Number(item.density) >= 0)) findings.push(finding("SQUINT_METRICS_MISSING", squintPath, `cell ${item.id ?? item.size} must contain measured metrics`));
      if (squintRec?.pass === true && item.silhouetteIntact !== true) findings.push(finding("SQUINT_PASS_INCONSISTENT", squintPath, `pass=true conflicts with cell ${item.id ?? item.size}`));
      const bbox = item.bbox;
      if (!Array.isArray(bbox) || bbox.length !== 4) findings.push(finding("SQUINT_BBOX_MISSING", squintPath, `cell ${item.id ?? item.size} must include bbox`));
      else if (samples.length > 0 && !samples.some((sample) => sample?.locator?.bbox?.every((value, index) => Number(value) === Number(bbox[index])))) findings.push(finding("SQUINT_BBOX_NOT_IN_MANIFEST", squintPath, `cell bbox ${bbox.join(",")} is not in the preview manifest`));
    }
    if (typeof squintRec?.observation !== "string" || squintRec.observation.trim().length < 24) findings.push(finding("SQUINT_OBSERVATION_WEAK", squintPath, "squint observation must describe the silhouette result"));
  }
  const review = parseJson(model.files, "review.logo.json", findings);
  const reviewRec = rec(review);
  if (review) {
    if (reviewRec?.masterDigest !== digest) findings.push(finding("REVIEW_MASTER_STALE", "review.logo.json", "review masterDigest must match current masters"));
    if (reviewRec?.autoStamped === true || reviewRec?.source === "project-preview-default") findings.push(finding("AESTHETIC_SCORES_AUTOSTAMPED", "review.logo.json", "aesthetic criteria must not be auto-stamped"));
    const criteria = rec(reviewRec?.criteria);
    if (!criteria || AESTHETIC_CRITERIA.some((key) => !isObject(criteria[key]))) findings.push(finding("AESTHETIC_CRITERIA_INCOMPLETE", "review.logo.json", `review must independently score every required criterion: ${AESTHETIC_CRITERIA.join(", ")}`));
    for (const key of AESTHETIC_CRITERIA) {
      const row = rec(criteria?.[key]);
      const score = Number(row?.score);
      const requiredMin = Number(row?.requiredMin);
      if (!Number.isFinite(score) || !Number.isFinite(requiredMin) || requiredMin < 2 || score < requiredMin) findings.push(finding("AESTHETIC_SCORE_BELOW_THRESHOLD", "review.logo.json", `${key} score ${score} < requiredMin ${requiredMin}; requiredMin cannot be lower than 2`));
      if (typeof row?.note !== "string" || row.note.trim().length < 8) findings.push(finding("AESTHETIC_NOTE_MISSING", "review.logo.json", `${key} requires a substantive note`));
    }
    if (reviewRec?.squintStripDigest !== fileDigest(model, stripPath)) findings.push(finding("REVIEW_SQUINT_DIGEST_MISMATCH", "review.logo.json", "review squintStripDigest must match strip PNG"));
  }
}
function validateVariants(model, findings) {
  const variants = parseJson(model.files, "src/variants/manifest.json", findings);
  if (!isObject(variants) || JSON.stringify(variants.roles) !== JSON.stringify(ROLES) || JSON.stringify(variants.variants) !== JSON.stringify(VARIANTS)) findings.push(finding("VARIANT_MANIFEST_INVALID", "src/variants/manifest.json", "variant manifest must declare the complete ordered role and variant matrix"));
}
function validateEvidenceRecord(model, filePath, schema, requiredChecks, code, findings) {
  const record = parseJson(model.files, filePath, findings, code);
  const checks = asList(rec(record)?.checks);
  const valid = isObject(record) && record.schema === schema && record.artifactId === model.artifactId && record.subjectDigest === computeLogoSubjectDigest(model) && requiredChecks.every((id) => checks.some((check) => rec(check)?.id === id && rec(check)?.status === "pass"));
  if (!valid) findings.push(finding(code, filePath, `${filePath} must bind the current subject and all required passing checks`));
  return record;
}
function validateRelease(model, findings) {
  for (const filePath of finalOutputPaths()) if (!hasFile(model, filePath)) findings.push(finding("RELEASE_PATH_MISSING", filePath, `${filePath} is required for release`));
  for (const variant of VARIANTS) for (const role of ROLES) {
    const filePath = `dist/${variant}/${role}.svg`;
    if (!hasFile(model, filePath)) continue;
    if (!svgValid(model.files?.[filePath])) findings.push(finding("RELEASE_SVG_INVALID", filePath, "release SVG must be a self-contained non-empty vector"));
    else if (geometrySignature(model.files?.[filePath]) !== geometrySignature(model.files?.[`build/master/${role}.svg`])) findings.push(finding("RELEASE_GEOMETRY_MISMATCH", filePath, "release SVG geometry must match the built master role"));
  }
  for (const role of ROLES) {
    const filePath = `dist/primary/${role}.png`;
    if (hasFile(model, filePath) && !pngValid(model, filePath)) findings.push(finding("RELEASE_PNG_INVALID", filePath, "primary PNG must have a valid PNG header and positive dimensions"));
  }
  for (const size of [64, 128, 256, 512]) {
    const filePath = `dist/exports/mark-${size}.png`;
    const info = hasFile(model, filePath) ? pngInfo(model, filePath) : null;
    if (hasFile(model, filePath) && (!info || info.width !== size || info.height !== size || !info.alpha || !info.hasInk || !info.hasTransparency)) findings.push(finding("DELIVERY_PNG_PROFILE_INVALID", filePath, `${size}px mark export must be an exact square PNG with visible ink and real transparency`));
  }
  for (const size of [16, 32]) {
    const filePath = `dist/icons/favicon-${size}.png`;
    const info = hasFile(model, filePath) ? pngInfo(model, filePath) : null;
    if (hasFile(model, filePath) && (!info || info.width !== size || info.height !== size || !info.alpha || !info.hasInk || !info.hasTransparency)) findings.push(finding("DELIVERY_ICON_PROFILE_INVALID", filePath, `${size}px favicon must be an exact square PNG with visible ink and real transparency`));
  }
  const appIcon = hasFile(model, "dist/icons/app-icon-512.png") ? pngInfo(model, "dist/icons/app-icon-512.png") : null;
  if (hasFile(model, "dist/icons/app-icon-512.png") && (!appIcon || appIcon.width !== 512 || appIcon.height !== 512)) findings.push(finding("DELIVERY_ICON_PROFILE_INVALID", "dist/icons/app-icon-512.png", "app icon must be an exact 512px square PNG"));
  for (const filePath of ["dist/presentation/specimen.png", "dist/presentation/application-mockup.png"]) {
    if (hasFile(model, filePath) && !pngValid(model, filePath)) findings.push(finding("PRESENTATION_ARTIFACT_INVALID", filePath, "presentation evidence must be a valid rendered PNG"));
  }
  if (hasFile(model, "dist/primary/lockup-stacked.svg") && !svgValid(model.files?.["dist/primary/lockup-stacked.svg"])) findings.push(finding("RELEASE_SVG_INVALID", "dist/primary/lockup-stacked.svg", "secondary lockup must be a self-contained vector"));
  const printNotes = rec(parseJson(model.files, "dist/print/production-notes.json", findings, "PRINT_GUIDANCE_INVALID"));
  if (printNotes && (printNotes.colorMode !== "CMYK" || typeof printNotes.conversionGuidance !== "string" || printNotes.conversionGuidance.trim().length < 12 || !Array.isArray(printNotes.spotColors))) findings.push(finding("PRINT_GUIDANCE_INVALID", "dist/print/production-notes.json", "print notes must document CMYK conversion guidance and spot-color decisions"));
  const figmaImport = rec(parseJson(model.files, "dist/integration/figma-import.json", findings, "FIGMA_FALLBACK_INVALID"));
  if (figmaImport && (figmaImport.mode !== "svg-import-package" || !Array.isArray(figmaImport.files) || !["dist/primary/mark.svg", "dist/primary/wordmark.svg", "dist/primary/lockup.svg"].every((path) => asList(figmaImport.files).includes(path)))) findings.push(finding("FIGMA_FALLBACK_INVALID", "dist/integration/figma-import.json", "Figma fallback must enumerate the import-ready primary SVG family"));
  validateEvidenceRecord(model, "evidence.accessibility.json", ACCESSIBILITY_SCHEMA, ["minimum-size", "contrast"], "ACCESSIBILITY_EVIDENCE_INVALID", findings);
  const render = rec(parseJson(model.files, "evidence.render.json", findings, "RENDER_EVIDENCE_INVALID"));
  const renderOutputs = asList(render?.outputs).map(rec).filter((entry) => entry !== void 0);
  if (!render || render.schema !== RENDER_EVIDENCE_SCHEMA || render.plugin !== PLUGIN || render.artifactId !== model.artifactId || render.subjectDigest !== computeLogoSubjectDigest(model) || typeof render.sessionId !== "string" || !render.sessionId || renderOutputs.length === 0 || renderOutputs.some((entry) => typeof entry.path !== "string" || entry.sha256 !== fileDigest(model, String(entry.path)))) {
    findings.push(finding("RENDER_EVIDENCE_INVALID", "evidence.render.json", "render evidence must bind the current subject, renderer session, and every declared output digest"));
  }
  const review = rec(validateEvidenceRecord(model, "review.logo.json", REVIEW_SCHEMA, REVIEW_CHECKS, "REVIEW_INVALID", findings));
  const reviewer = rec(review?.reviewer);
  if (review?.decision !== "approved") findings.push(finding("REVIEW_INVALID", "review.logo.json", "logo review decision must be approved"));
  const reviewFindings = asList(review?.findings).map(rec).filter((entry) => entry !== void 0);
  const expectedReviewPaths = reviewArtifactPaths(model);
  const reviewCoverage = asList(review?.coverage).map(rec).filter((entry) => entry !== void 0);
  if (review && (reviewCoverage.length !== expectedReviewPaths.length || reviewCoverage.some((entry, index) => entry.path !== expectedReviewPaths[index] || entry.sha256 !== fileDigest(model, String(entry.path))))) findings.push(finding("REVIEW_COVERAGE_INVALID", "review.logo.json", "independent review must cover every current visual artifact path and digest in lexical order"));
  if (reviewFindings.some((entry) => !["blocker", "major", "minor", "info"].includes(String(entry.severity)) || typeof entry.findingId !== "string" || !entry.findingId.trim() || typeof entry.evidenceAnchor !== "string" || !expectedReviewPaths.includes(entry.evidenceAnchor) || entry.artifactDigest !== fileDigest(model, entry.evidenceAnchor) || typeof entry.fix !== "string" || !entry.fix.trim() || !["open", "fixed_pending_recheck", "verified"].includes(String(entry.status)) || ["blocker", "major"].includes(String(entry.severity)) && (entry.status !== "verified" || typeof entry.recheckEvidence !== "string" || !entry.recheckEvidence.trim()))) findings.push(finding("REVIEW_FINDINGS_INVALID", "review.logo.json", "findings require stable ids, current anchors and digests; blocker/major findings must be independently verified"));
  if (review && (!["human", "independent-agent"].includes(reviewer?.kind) || typeof reviewer?.sessionId !== "string" || !reviewer.sessionId)) {
    findings.push(finding("REVIEWER_INVALID", "review.logo.json", "logo review must name an independent reviewer kind and sessionId"));
  } else if (reviewer?.sessionId && reviewer.sessionId === (process.env.AI_EXPERTS_SESSION_ID || "unknown")) {
    findings.push(finding("REVIEW_SELF", "review.logo.json", "logo reviewer session must differ from the current release session"));
  }
  if (hasFile(model, "release.manifest.json") && !exactJson(model.files?.["release.manifest.json"], createLogoReleaseManifest(model))) findings.push(finding("RELEASE_MANIFEST_INVALID", "release.manifest.json", "release manifest must bind current source and every delivery byte"));
  if (!hasFile(model, "receipt.release.json")) findings.push(finding("RELEASE_PATH_MISSING", "receipt.release.json", "receipt.release.json is required for release"));
  else if (!validateLogoReceipt(model)) findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind current logo sources, masters, evidence, and outputs"));
}
function validateLogoModel(model, { stage = "source" } = {}) {
  const findings = [];
  const files = model?.files ?? {};
  if (hasFile(model, ".logo-delivery-journal.json")) findings.push(finding("MUTATION_JOURNAL_OPEN", ".logo-delivery-journal.json", "an interrupted generated writer must be resumed or rolled back"));
  validateRequired(files, findings);
  validatePlanAndProject(model ?? {}, stage, findings);
  validateToolchain(files, findings);
  validateArtifactGitignore(files, findings);
  validateConcepts(model ?? {}, findings);
  validateMaster(model ?? {}, findings);
  validateWordmarkManifest(model ?? {}, findings);
  validateConstruction(model ?? {}, findings);
  validateVariants(model ?? {}, findings);
  validateBriefAndSkillComposition(model ?? {}, findings);
  if (stage === "release") {
    validateRelease(model ?? {}, findings);
    validatePreviewAndAesthetic(model ?? {}, findings);
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}
function evaluateLogoWrite({ relativePath = "", toolName = "" } = {}) {
  const normalized = relativePath.replaceAll("\\", "/");
  const match = normalized.match(/(?:^|\/)artifacts\/logo\/[^/]+\/(?<inside>.+)$/u);
  if (!match) return { decision: "allow" };
  const inside = match.groups?.inside;
  if (inside === void 0) return { decision: "allow" };
  if (generatedSubjectPath(inside)) return { decision: "deny", code: "PROTECTED_WRITER_REQUIRED", message: `${inside} must be written by a registered logo guard tool, not ${toolName || "an unregistered tool"}` };
  return { decision: "allow" };
}

export {
  decodePngToRgba,
  PLAN_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  SKILL_ADVICE_SCHEMA,
  SKILL_ADVICE_INPUT_SCHEMA,
  RENDER_EVIDENCE_SCHEMA,
  REVIEW_INPUT_SCHEMA,
  REVIEW_SCHEMA,
  AESTHETIC_CRITERIA,
  REVIEW_CHECKS,
  EXTERNAL_SKILLS,
  computeLogoSubjectDigest,
  masterSubjectDigest,
  reviewArtifactPaths,
  createLogoReleaseManifest,
  createLogoReceipt,
  validateLogoReceipt,
  validateLogoModel,
  evaluateLogoWrite
};
