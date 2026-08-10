import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

export const PLAN_SCHEMA = "logo-project-delivery-guard/plan/v1";
export const PROJECT_SCHEMA = "logo-project-delivery-guard/project/v1";
export const CONSTRUCTION_SCHEMA = "logo-project-delivery-guard/construction/v1";
export const STANDARD_GRID_SCHEMA = "logo-project-delivery-guard/standard-grid/v1";
export const GEOMETRY_SCHEMA = "logo-project-delivery-guard/geometry/v1";
export const FIBONACCI_SCHEMA = "logo-project-delivery-guard/fibonacci/v1";
export const CONSTRUCTION_MANIFEST_SCHEMA = "logo-project-delivery-guard/construction-manifest/v1";
export const ACCESSIBILITY_SCHEMA = "logo-project-delivery-guard/accessibility/v1";
export const REVIEW_SCHEMA = "logo-project-delivery-guard/review/v1";
export const RELEASE_MANIFEST_SCHEMA = "logo-project-delivery-guard/release-manifest/v1";

const PLUGIN = "logo-project-delivery-guard";
const STAGES = new Set(["source", "release"]);
const ROLES = ["mark", "wordmark", "lockup"];
const VARIANTS = ["primary", "mono", "reverse"];
const SHEETS = ["standard", "geometry", "fibonacci"];
const CONCEPT_SOURCE = /^(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.logo\.tsx$/u;
const CONCEPT_PROOF_PATH = /^src\/concepts\/.+\.[0-9a-f]{64}\.png$/u;
const GENERATED_PATH = /^(?:build\/|dist\/|evidence(?:\.|\/)|review\.logo\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$|\.logo-delivery-journal\.json$)/u;
const MASTER_VECTOR_VIOLATION = /(?:<\s*(?:image|text|foreignObject|script|style|iframe)\b|https?:\/\/|(?:from\s+|import\s*\(|require\s*\()\s*["']node:[^"']+["']|\b(?:fetch|useState|useEffect|setTimeout|setInterval|XMLHttpRequest|WebSocket|eval)\s*\(|\b(?:Date\.now|Math\.random|new\s+Function)\s*\(|\b(?:Bun|Deno)\.)/u;
const VECTOR_ELEMENT = /<(?:path|circle|ellipse|rect|line|polyline|polygon)\b/u;
const FORBIDDEN_SVG = /<(?:image|text|foreignObject|script|style|iframe|use|filter)\b|<!DOCTYPE\b|<\?xml-stylesheet\b|url\(\s*https?:|\s(?:width|height|transform|style|class|clip-path|mask|display|visibility|opacity|fill-opacity|stroke-opacity|on[a-z]+)\s*=|(?:href|xlink:href)\s*=\s*["'](?:https?:|data:)/u;
const SVG_TAGS = new Set(["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs", "linearGradient", "radialGradient", "stop"]);
const PRIMITIVE_TYPES = new Set(["circle", "ellipse", "rect", "line", "arc", "polygon", "path"]);

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const finding = (code, path, message) => ({ code, path, message });
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const textOf = (value) => Buffer.isBuffer(value) ? value.toString("utf8") : typeof value === "string" ? value : "";
const rawBytes = (model, filePath) => {
  const fromBytes = model?.bytes?.[filePath];
  if (Buffer.isBuffer(fromBytes)) return fromBytes;
  const value = model?.files?.[filePath];
  return Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : "");
};
const fileDigest = (model, filePath) => model?.digests?.[filePath] ?? sha256(rawBytes(model, filePath));
const hasFile = (model, filePath) => Object.prototype.hasOwnProperty.call(model?.files ?? {}, filePath);

function parseJson(files, filePath, findings, code = "JSON_INVALID") {
  if (!Object.prototype.hasOwnProperty.call(files, filePath)) {
    findings.push(finding(filePath === "plan.contract.json" ? "PLAN_CONTRACT_MISSING" : "REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
    return null;
  }
  try { return JSON.parse(textOf(files[filePath])); } catch {
    findings.push(finding(code, filePath, `${filePath} must contain valid JSON`));
    return null;
  }
}

function generatedSubjectPath(filePath) {
  return GENERATED_PATH.test(filePath) || CONCEPT_PROOF_PATH.test(filePath);
}

export function computeLogoSubjectDigest(model) {
  return sha256(Object.keys(model?.digests ?? model?.files ?? {})
    .filter((filePath) => !generatedSubjectPath(filePath))
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => `${filePath}\0${fileDigest(model, filePath)}\n`)
    .join(""));
}

export function masterSubjectDigest(model) {
  return sha256(ROLES.map((role) => {
    const filePath = `build/master/${role}.svg`;
    return `${filePath}\0${fileDigest(model, filePath)}\n`;
  }).join(""));
}

function conceptPreviewPaths(model) {
  try {
    const manifest = JSON.parse(textOf(model?.files?.["src/concepts/manifest.json"]));
    return (Array.isArray(manifest?.concepts) ? manifest.concepts : []).flatMap((entry) => {
      const sourcePath = `src/concepts/${entry?.source ?? ""}`;
      return hasFile(model, sourcePath) ? [`src/concepts/${entry.source.slice(0, -9)}.${fileDigest(model, sourcePath)}.png`] : [];
    });
  } catch { return []; }
}

export function constructionPaths(model) {
  const digest = masterSubjectDigest(model);
  return [
    ...SHEETS.flatMap((sheet) => ["svg", "png"].map((extension) => `evidence/construction/${sheet}.${digest}.${extension}`)),
    `evidence/construction/manifest.${digest}.json`,
  ];
}

function finalOutputPaths() {
  return [
    ...VARIANTS.flatMap((variant) => ROLES.map((role) => `dist/${variant}/${role}.svg`)),
    ...ROLES.map((role) => `dist/primary/${role}.png`),
    "evidence.accessibility.json", "review.logo.json", "release.manifest.json",
  ];
}

export function logoDeliveryPaths(model, { stage = "release" } = {}) {
  const sourcePaths = [...conceptPreviewPaths(model), ...ROLES.map((role) => `build/master/${role}.svg`), ...constructionPaths(model)];
  return stage === "release" ? [...sourcePaths, ...finalOutputPaths()] : sourcePaths;
}

export function createConstructionManifest(model) {
  const masterDigest = masterSubjectDigest(model);
  const sheets = Object.fromEntries(SHEETS.map((sheet) => [sheet, Object.fromEntries(["svg", "png"].map((extension) => {
    const path = `evidence/construction/${sheet}.${masterDigest}.${extension}`;
    return [extension, { path, sha256: fileDigest(model, path) }];
  }))]));
  return { schema: CONSTRUCTION_MANIFEST_SCHEMA, plugin: PLUGIN, artifactId: model?.artifactId, masterDigest, sheets };
}

export function createLogoReleaseManifest(model) {
  const outputs = logoDeliveryPaths(model, { stage: "release" }).filter((path) => path !== "release.manifest.json");
  return {
    schema: RELEASE_MANIFEST_SCHEMA,
    plugin: PLUGIN,
    artifactId: model?.artifactId,
    subjectDigest: computeLogoSubjectDigest(model),
    outputs: Object.fromEntries(outputs.map((path) => [path, fileDigest(model, path)])),
  };
}

export function createLogoReceipt(model) {
  return {
    schemaVersion: 2,
    plugin: PLUGIN,
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest: computeLogoSubjectDigest(model),
    outputs: Object.fromEntries(logoDeliveryPaths(model, { stage: "release" }).map((path) => [path, fileDigest(model, path)])),
  };
}

function exactJson(actualText, expected) {
  try { return JSON.stringify(JSON.parse(textOf(actualText))) === JSON.stringify(expected); } catch { return false; }
}

export function validateLogoReceipt(model) {
  try {
    const actual = JSON.parse(textOf(model?.files?.["receipt.release.json"]));
    const expected = createLogoReceipt(model);
    return actual?.schemaVersion === expected.schemaVersion
      && actual?.plugin === expected.plugin
      && actual?.artifactId === expected.artifactId
      && actual?.stage === expected.stage
      && actual?.subjectDigest === expected.subjectDigest
      && JSON.stringify(actual?.outputs) === JSON.stringify(expected.outputs);
  } catch { return false; }
}

function validateRequired(files, findings) {
  for (const filePath of [
    ".gitignore", "package.json", "package-lock.json", "plan.contract.json", "plan.assets.json",
    "logo.project.json", "src/render.ts", "src/concepts/manifest.json", "src/master/Mark.logo.tsx",
    "src/master/Wordmark.logo.tsx", "src/master/Lockup.logo.tsx", "src/construction/construction.json",
    "src/construction/standard-grid.json", "src/construction/geometry.json", "src/construction/fibonacci.json",
    "src/variants/manifest.json", "build/master/mark.svg", "build/master/wordmark.svg", "build/master/lockup.svg",
  ]) if (!Object.prototype.hasOwnProperty.call(files, filePath)) findings.push(finding(filePath === "plan.contract.json" ? "PLAN_CONTRACT_MISSING" : "REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
}

function validatePlanAndProject(model, stage, findings) {
  const plan = parseJson(model.files, "plan.contract.json", findings, "PLAN_CONTRACT_INVALID");
  if (plan && (!isObject(plan) || plan.schema !== PLAN_SCHEMA || plan.artifactId !== model.artifactId || !STAGES.has(plan.targetStage))) findings.push(finding("PLAN_CONTRACT_INVALID", "plan.contract.json", "plan must bind schema, artifactId, and targetStage source|release"));
  if (!STAGES.has(stage)) findings.push(finding("STAGE_INVALID", "plan.contract.json", "closure stage must be source or release"));
  else if (plan?.targetStage !== stage) findings.push(finding("PLAN_STAGE_MISMATCH", "plan.contract.json", "validated closure stage must match plan targetStage"));
  const project = parseJson(model.files, "logo.project.json", findings);
  if (project && (!isObject(project) || project.schema !== PROJECT_SCHEMA || project.artifactId !== model.artifactId || typeof project.selectedConcept !== "string" || !project.selectedConcept)) findings.push(finding("LOGO_PROJECT_INVALID", "logo.project.json", "project must bind schema, artifactId, and selectedConcept"));
}

function validateToolchain(files, findings) {
  const pkg = parseJson(files, "package.json", findings);
  const lock = parseJson(files, "package-lock.json", findings);
  if (pkg && (!isObject(pkg) || typeof pkg.scripts?.["logo:render"] !== "string" || !pkg.scripts["logo:render"].trim())) findings.push(finding("RENDER_SCRIPT_MISSING", "package.json", "package.json scripts.logo:render is required"));
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
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
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
  const depth = header[8];
  const colorType = header[9];
  const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(colorType);
  const depths = new Map([[0, [1, 2, 4, 8, 16]], [2, [8, 16]], [3, [1, 2, 4, 8]], [4, [8, 16]], [6, [8, 16]]]).get(colorType) ?? [];
  if (!width || !height || !channels || !depths.includes(depth) || (colorType === 3 && !palette) || header[10] !== 0 || header[11] !== 0 || header[12] !== 0) return false;
  const rowBytes = Math.ceil((width * channels * depth) / 8) + 1;
  const expectedLength = rowBytes * height;
  if (!Number.isSafeInteger(expectedLength) || expectedLength > 128 * 1024 * 1024) return false;
  try {
    const inflated = inflateSync(Buffer.concat(idat), { maxOutputLength: expectedLength });
    if (inflated.byteLength !== expectedLength) return false;
    for (let row = 0; row < height; row += 1) if (inflated[row * rowBytes] > 4) return false;
    return true;
  } catch { return false; }
}

function svgWellFormed(svg) {
  const stack = [];
  let cursor = 0;
  let roots = 0;
  for (const match of svg.matchAll(/<\/?([A-Za-z][A-Za-z0-9]*)\b([^<>]*)>/gu)) {
    if (svg.slice(cursor, match.index).trim()) return false;
    const token = match[0];
    const name = match[1];
    const closing = token.startsWith("</");
    if (!SVG_TAGS.has(name)) return false;
    if (closing) {
      if (match[2].trim() || stack.pop() !== name) return false;
    } else {
      const selfClosing = /\/\s*>$/u.test(token);
      const attributesText = match[2].replace(/\/\s*$/u, "");
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
    cursor = match.index + token.length;
  }
  return roots === 1 && stack.length === 0 && !svg.slice(cursor).trim();
}

function svgAttributes(text) {
  return new Map([...text.matchAll(/\b([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*["']([^"']*)["']/gu)].map((match) => [match[1], match[2]]));
}

function finiteNumber(value, { positive = false } = {}) {
  if (typeof value !== "string" || !value.trim()) return false;
  const number = Number(value);
  return Number.isFinite(number) && (!positive || number > 0);
}

function pathDataValid(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const tokenPattern = /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][-+]?\d+)?/gu;
  const tokens = [...value.matchAll(tokenPattern)].map((match) => match[0]);
  if (!tokens.length || value.replace(tokenPattern, "").replace(/[\s,]+/gu, "")) return false;
  const commandPattern = /^[AaCcHhLlMmQqSsTtVvZz]$/u;
  const arity = { A: 7, C: 6, H: 1, L: 2, M: 2, Q: 4, S: 4, T: 2, V: 1, Z: 0 };
  let cursor = 0;
  let command = null;
  let drawable = false;
  while (cursor < tokens.length) {
    if (commandPattern.test(tokens[cursor])) {
      command = tokens[cursor].toUpperCase();
      cursor += 1;
      if (command === "Z") { command = null; continue; }
    }
    if (!command) return false;
    const values = [];
    while (cursor < tokens.length && !commandPattern.test(tokens[cursor])) {
      const number = Number(tokens[cursor]);
      if (!Number.isFinite(number)) return false;
      values.push(number);
      cursor += 1;
    }
    const size = arity[command];
    if (values.length < size || values.length % size !== 0) return false;
    if (command === "A") for (let offset = 0; offset < values.length; offset += size) {
      if (!(values[offset] > 0) || !(values[offset + 1] > 0) || ![0, 1].includes(values[offset + 3]) || ![0, 1].includes(values[offset + 4])) return false;
    }
    if (command !== "M" || values.length > size) drawable = true;
  }
  return drawable;
}

function vectorGeometryValid(svg) {
  const elements = [...svg.matchAll(/<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)>/gu)];
  if (elements.length === 0) return false;
  return elements.every(([, name, raw]) => {
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
  const ids = new Set();
  for (const match of textOf(value).matchAll(/<(?:path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)>/gu)) {
    const id = match[1].match(/\bid\s*=\s*["']([^"']+)["']/u)?.[1];
    if (id) ids.add(id);
  }
  return ids;
}

function geometrySignature(value) {
  const svg = textOf(value);
  const elements = [...svg.matchAll(/<(svg|g|path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)>/gu)].map((match) => {
    const attributes = [...match[2].matchAll(/\b([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*["']([^"']*)["']/gu)]
      .filter((attribute) => !["xmlns", "fill", "color"].includes(attribute[1]) && !attribute[1].startsWith("aria-") && !attribute[1].startsWith("data-"))
      .map((attribute) => {
        const name = attribute[1];
        const raw = attribute[2].trim().replace(/\s+/gu, " ");
        const normalized = name === "stroke" ? (raw === "none" ? "none" : "paint") : raw;
        return `${name}=${normalized}`;
      }).sort().join(";");
    return `${match[1]}:${attributes}`;
  });
  return elements.join("|");
}

function validateConcepts(model, findings) {
  const manifest = parseJson(model.files, "src/concepts/manifest.json", findings);
  const concepts = Array.isArray(manifest?.concepts) ? manifest.concepts : [];
  let project = null;
  try { project = JSON.parse(textOf(model.files["logo.project.json"])); } catch { /* reported by project validation */ }
  const ids = concepts.map((entry) => entry?.id);
  const sources = concepts.map((entry) => entry?.source);
  if (concepts.length === 0 || new Set(ids).size !== ids.length || new Set(sources).size !== sources.length || concepts.filter((entry) => entry?.id === project?.selectedConcept).length !== 1) findings.push(finding("CONCEPT_MANIFEST_INVALID", "src/concepts/manifest.json", "concept ids and sources must be unique, ordered, and select exactly the project concept"));
  concepts.forEach((entry, offset) => {
    const match = typeof entry?.source === "string" ? entry.source.match(CONCEPT_SOURCE) : null;
    const sourcePath = `src/concepts/${entry?.source ?? "manifest.json"}`;
    if (!match || typeof entry.id !== "string" || !entry.id || entry.index !== offset + 1 || Number(match?.groups.index) !== entry.index) {
      findings.push(finding("CONCEPT_SEQUENCE_INVALID", sourcePath, "concepts must use ids and contiguous NNN-slug.logo.tsx sources"));
      return;
    }
    if (!hasFile(model, sourcePath)) { findings.push(finding("CONCEPT_SOURCE_MISSING", sourcePath, "concept source is missing")); return; }
    const preview = `src/concepts/${entry.source.slice(0, -9)}.${fileDigest(model, sourcePath)}.png`;
    if (!hasFile(model, preview)) findings.push(finding("CONCEPT_PREVIEW_MISSING", preview, "current source-hash concept preview is required"));
    else if (!pngValid(model, preview)) findings.push(finding("CONCEPT_PREVIEW_INVALID", preview, "concept preview must be a decodable PNG header with positive dimensions"));
  });
}

function validateMaster(model, findings) {
  for (const [index, displayRole] of ["Mark", "Wordmark", "Lockup"].entries()) {
    const filePath = `src/master/${displayRole}.logo.tsx`;
    const source = textOf(model.files[filePath]);
    if (!source) continue;
    const exports = source.match(/export\s+function\s+[A-Za-z][A-Za-z0-9]*\s*\(/gu) ?? [];
    if (MASTER_VECTOR_VIOLATION.test(source) || !new RegExp(`export\\s+function\\s+${displayRole}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*return\\s*\\(?\\s*<svg\\b`, "u").test(source)) findings.push(finding("MASTER_VECTOR_VIOLATION", filePath, "master role must be its named self-contained native-vector SVG component"));
    if (exports.length !== 1) findings.push(finding("MASTER_EXPORT_INVALID", filePath, "master role must export exactly one SVG component"));
    const role = ROLES[index];
    const builtPath = `build/master/${role}.svg`;
    if (hasFile(model, builtPath) && !svgValid(model.files[builtPath])) findings.push(finding("MASTER_SVG_INVALID", builtPath, "built master must be a self-contained non-empty SVG with viewBox"));
  }
}

function validateConstruction(model, findings) {
  const construction = parseJson(model.files, "src/construction/construction.json", findings);
  const standard = parseJson(model.files, "src/construction/standard-grid.json", findings);
  const geometry = parseJson(model.files, "src/construction/geometry.json", findings);
  const fibonacci = parseJson(model.files, "src/construction/fibonacci.json", findings);
  const digest = masterSubjectDigest(model);
  if (!isObject(construction) || construction.schema !== CONSTRUCTION_SCHEMA || !(Number(construction.tolerance) >= 0) || !(Number(construction.maxOpticalCorrection) >= 0)) findings.push(finding("CONSTRUCTION_CONFIG_INVALID", "src/construction/construction.json", "construction config must declare schema and non-negative tolerances"));
  if (!isObject(standard) || standard.schema !== STANDARD_GRID_SCHEMA || standard.masterDigest !== digest || !(Number(standard.unit) > 0) || !(Number(standard.clearSpace) > 0) || !(Number(standard.minimumPixels) > 0)) findings.push(finding("STANDARD_GRID_INVALID", "src/construction/standard-grid.json", "standard grid must bind current master and use positive unit, clear space, and minimum size"));

  const primitives = Array.isArray(geometry?.primitives) ? geometry.primitives : [];
  const mappings = Array.isArray(geometry?.pathMappings) ? geometry.pathMappings : [];
  const primitiveIds = new Set();
  let geometryValid = isObject(geometry) && geometry.schema === GEOMETRY_SCHEMA && geometry.masterDigest === digest && primitives.length > 0 && mappings.length >= ROLES.length;
  for (const primitive of primitives) {
    const parameters = isObject(primitive?.parameters) ? Object.values(primitive.parameters) : [];
    if (!isObject(primitive) || typeof primitive.id !== "string" || !primitive.id || primitiveIds.has(primitive.id) || !PRIMITIVE_TYPES.has(primitive.type) || parameters.length === 0 || parameters.some((value) => typeof value !== "number" || !Number.isFinite(value))) geometryValid = false;
    else primitiveIds.add(primitive.id);
  }
  const mappingKeys = new Set();
  const mappingPrimitives = new Map();
  for (const mapping of mappings) {
    const masterIds = svgPrimitiveIds(model.files[`build/master/${mapping?.role}.svg`]);
    const key = `${mapping?.role}:${mapping?.pathId}`;
    if (!ROLES.includes(mapping?.role) || typeof mapping?.pathId !== "string" || !masterIds.has(mapping.pathId) || !Array.isArray(mapping.primitiveIds) || mapping.primitiveIds.length === 0 || new Set(mapping.primitiveIds).size !== mapping.primitiveIds.length || mapping.primitiveIds.some((id) => !primitiveIds.has(id)) || mappingKeys.has(key)) geometryValid = false;
    else {
      mappingKeys.add(key);
      mappingPrimitives.set(key, new Set(mapping.primitiveIds));
    }
  }
  if (ROLES.some((role) => !mappings.some((mapping) => mapping?.role === role))) geometryValid = false;
  if (!geometryValid) findings.push(finding("GEOMETRY_MAPPING_INVALID", "src/construction/geometry.json", "geometry must bind current master ids to unique, numeric stable primitives for every role"));

  const sequence = [1, 1, 2, 3, 5, 8, 13];
  const anchors = Array.isArray(fibonacci?.anchors) ? fibonacci.anchors : [];
  const anchorIds = new Set();
  let fibonacciValid = isObject(fibonacci) && fibonacci.schema === FIBONACCI_SCHEMA && fibonacci.masterDigest === digest && JSON.stringify(fibonacci.sequence) === JSON.stringify(sequence) && new Set(["structural", "optical-reference"]).has(fibonacci.usage);
  for (const anchor of anchors) {
    const key = `${anchor?.role}:${anchor?.pathId}`;
    if (!isObject(anchor) || typeof anchor.id !== "string" || !anchor.id || anchorIds.has(anchor.id) || !mappingKeys.has(key) || !mappingPrimitives.get(key)?.has(anchor.primitiveId) || !["outline", "negative-space", "turn"].includes(anchor.kind) || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || !sequence.includes(anchor.sequenceValue)) fibonacciValid = false;
    else anchorIds.add(anchor.id);
  }
  if (anchors.filter(({ kind }) => kind === "outline").length < 2 || anchors.filter(({ kind }) => kind === "negative-space" || kind === "turn").length < 1) fibonacciValid = false;
  if (!fibonacciValid) findings.push(finding("FIBONACCI_ANCHORS_INVALID", "src/construction/fibonacci.json", "Fibonacci anchors must bind coordinates and sequence values to mapped current-master paths"));

  for (const sheet of SHEETS) for (const extension of ["svg", "png"]) {
    const filePath = `evidence/construction/${sheet}.${digest}.${extension}`;
    if (!hasFile(model, filePath)) findings.push(finding("CONSTRUCTION_SHEET_MISSING", filePath, `${sheet} ${extension.toUpperCase()} sheet must bind the current master digest`));
    else if (extension === "svg" ? !svgValid(model.files[filePath], { sheet, masterDigest: digest }) : !pngValid(model, filePath)) findings.push(finding("CONSTRUCTION_SHEET_INVALID", filePath, `${sheet} sheet must be a valid bound ${extension.toUpperCase()}`));
  }
  const manifestPath = `evidence/construction/manifest.${digest}.json`;
  if (!hasFile(model, manifestPath)) findings.push(finding("CONSTRUCTION_MANIFEST_MISSING", manifestPath, "construction manifest is required"));
  else if (!exactJson(model.files[manifestPath], createConstructionManifest(model))) findings.push(finding("CONSTRUCTION_MANIFEST_INVALID", manifestPath, "construction manifest must bind current master and sheet bytes"));
}

function validateVariants(model, findings) {
  const variants = parseJson(model.files, "src/variants/manifest.json", findings);
  if (!isObject(variants) || JSON.stringify(variants.roles) !== JSON.stringify(ROLES) || JSON.stringify(variants.variants) !== JSON.stringify(VARIANTS)) findings.push(finding("VARIANT_MANIFEST_INVALID", "src/variants/manifest.json", "variant manifest must declare the complete ordered role and variant matrix"));
}

function validateEvidenceRecord(model, filePath, schema, requiredChecks, code, findings) {
  const record = parseJson(model.files, filePath, findings, code);
  const checks = Array.isArray(record?.checks) ? record.checks : [];
  const valid = isObject(record) && record.schema === schema && record.artifactId === model.artifactId && record.subjectDigest === computeLogoSubjectDigest(model)
    && requiredChecks.every((id) => checks.some((check) => check?.id === id && check?.status === "pass"));
  if (!valid) findings.push(finding(code, filePath, `${filePath} must bind the current subject and all required passing checks`));
  return record;
}

function validateRelease(model, findings) {
  for (const filePath of finalOutputPaths()) if (!hasFile(model, filePath)) findings.push(finding("RELEASE_PATH_MISSING", filePath, `${filePath} is required for release`));
  for (const variant of VARIANTS) for (const role of ROLES) {
    const filePath = `dist/${variant}/${role}.svg`;
    if (!hasFile(model, filePath)) continue;
    if (!svgValid(model.files[filePath])) findings.push(finding("RELEASE_SVG_INVALID", filePath, "release SVG must be a self-contained non-empty vector"));
    else if (geometrySignature(model.files[filePath]) !== geometrySignature(model.files[`build/master/${role}.svg`])) findings.push(finding("RELEASE_GEOMETRY_MISMATCH", filePath, "release SVG geometry must match the built master role"));
  }
  for (const role of ROLES) {
    const filePath = `dist/primary/${role}.png`;
    if (hasFile(model, filePath) && !pngValid(model, filePath)) findings.push(finding("RELEASE_PNG_INVALID", filePath, "primary PNG must have a valid PNG header and positive dimensions"));
  }
  validateEvidenceRecord(model, "evidence.accessibility.json", ACCESSIBILITY_SCHEMA, ["minimum-size", "contrast"], "ACCESSIBILITY_EVIDENCE_INVALID", findings);
  const review = validateEvidenceRecord(model, "review.logo.json", REVIEW_SCHEMA, ["geometry", "legibility", "variants"], "REVIEW_INVALID", findings);
  if (review?.decision !== "approved") findings.push(finding("REVIEW_INVALID", "review.logo.json", "logo review decision must be approved"));
  if (hasFile(model, "release.manifest.json") && !exactJson(model.files["release.manifest.json"], createLogoReleaseManifest(model))) findings.push(finding("RELEASE_MANIFEST_INVALID", "release.manifest.json", "release manifest must bind current source and every delivery byte"));
  if (!hasFile(model, "receipt.release.json")) findings.push(finding("RELEASE_PATH_MISSING", "receipt.release.json", "receipt.release.json is required for release"));
  else if (!validateLogoReceipt(model)) findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind current logo sources, masters, evidence, and outputs"));
}

export function validateLogoModel(model, { stage = "source" } = {}) {
  const findings = [];
  const files = model?.files ?? {};
  if (hasFile(model, ".logo-delivery-journal.json")) findings.push(finding("MUTATION_JOURNAL_OPEN", ".logo-delivery-journal.json", "an interrupted generated writer must be resumed or rolled back"));
  validateRequired(files, findings);
  validatePlanAndProject(model, stage, findings);
  validateToolchain(files, findings);
  validateArtifactGitignore(files, findings);
  validateConcepts(model, findings);
  validateMaster(model, findings);
  validateConstruction(model, findings);
  validateVariants(model, findings);
  if (stage === "release") validateRelease(model, findings);
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}

export function evaluateLogoWrite({ relativePath = "", toolName = "" } = {}) {
  const normalized = relativePath.replaceAll("\\", "/");
  const match = normalized.match(/(?:^|\/)artifacts\/logo\/[^/]+\/(?<inside>.+)$/u);
  if (!match) return { decision: "allow" };
  const inside = match.groups.inside;
  if (generatedSubjectPath(inside)) return { decision: "deny", code: "PROTECTED_WRITER_REQUIRED", message: `${inside} must be written by a registered logo guard tool, not ${toolName || "an unregistered tool"}` };
  return { decision: "allow" };
}
