import { createHash } from "node:crypto";

const CONCEPT_SOURCE = /^(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.logo\.tsx$/u;
const GENERATED_PATH = /^(?:build\/master\/|dist\/|evidence(?:\/|\.[^/]+\.json$)|evidence\.accessibility\.json$|review\.logo\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$)/u;
const MASTER_VECTOR_VIOLATION = /(?:<\s*(?:image|text|foreignObject|script|style|iframe)\b|https?:\/\/|from\s+["'](?:node:fs|node:child_process)["']|\b(?:fetch|useState|useEffect|setTimeout|setInterval)\s*\(|\b(?:Date\.now|Math\.random)\s*\()/u;
const RECEIPT_EXCLUDED_PATH = /^(?:build\/|dist\/|evidence(?:\.|\/)|review\.logo\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$|\.logo-delivery-journal\.json$)/u;
const CONCEPT_PROOF_PATH = /^src\/concepts\/.+\.[0-9a-f]{64}\.png$/u;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const finding = (code, path, message) => ({ code, path, message });
const fileDigest = (model, filePath) => model?.digests?.[filePath] ?? sha256(model?.files?.[filePath] ?? "");

export function computeLogoSubjectDigest(model) {
  const records = Object.entries(model?.files ?? {})
    .filter(([filePath, value]) => typeof value === "string" && !RECEIPT_EXCLUDED_PATH.test(filePath) && !CONCEPT_PROOF_PATH.test(filePath))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath]) => `${filePath}\0${fileDigest(model, filePath)}\n`)
    .join("");
  return sha256(records);
}

function logoOutputPaths() {
  return [
    "dist/primary/mark.svg", "dist/primary/mark.png", "dist/primary/wordmark.svg", "dist/primary/wordmark.png",
    "dist/primary/lockup.svg", "dist/primary/lockup.png", "dist/mono/mark.svg", "dist/mono/wordmark.svg",
    "dist/mono/lockup.svg", "dist/reverse/mark.svg", "dist/reverse/wordmark.svg", "dist/reverse/lockup.svg",
    "evidence.accessibility.json", "review.logo.json", "release.manifest.json",
  ];
}

export function createLogoReceipt(model) {
  return {
    schemaVersion: 1,
    plugin: "logo-project-delivery-guard",
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest: computeLogoSubjectDigest(model),
    outputs: Object.fromEntries(logoOutputPaths().map((filePath) => [filePath, fileDigest(model, filePath)])),
  };
}

export function validateLogoReceipt(model) {
  try {
    const actual = JSON.parse(model?.files?.["receipt.release.json"] ?? "");
    const expected = createLogoReceipt(model);
    return actual?.schemaVersion === expected.schemaVersion
      && actual?.plugin === expected.plugin
      && actual?.artifactId === expected.artifactId
      && actual?.stage === expected.stage
      && actual?.subjectDigest === expected.subjectDigest
      && JSON.stringify(actual?.outputs) === JSON.stringify(expected.outputs);
  } catch {
    return false;
  }
}

function parseJson(files, filePath, findings) {
  if (typeof files[filePath] !== "string") {
    findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
    return null;
  }
  try { return JSON.parse(files[filePath]); } catch {
    findings.push(finding("JSON_INVALID", filePath, `${filePath} must contain valid JSON`));
    return null;
  }
}

export function masterSubjectDigest(model) {
  const records = ["lockup", "mark", "wordmark"].map((role) => {
    const filePath = `build/master/${role}.svg`;
    return `${filePath}\0${sha256(model?.files?.[filePath] ?? "")}\n`;
  }).join("");
  return sha256(records);
}

function validateRequired(files, findings) {
  for (const filePath of [
    ".gitignore", "package.json", "package-lock.json", "plan.contract.json", "plan.assets.json",
    "logo.project.json", "src/render.ts", "src/concepts/manifest.json", "src/master/Mark.logo.tsx",
    "src/master/Wordmark.logo.tsx", "src/master/Lockup.logo.tsx", "src/construction/construction.json",
    "src/construction/standard-grid.json", "src/construction/geometry.json", "src/construction/fibonacci.json",
    "src/variants/manifest.json", "build/master/mark.svg", "build/master/wordmark.svg", "build/master/lockup.svg",
  ]) if (!(filePath in files)) findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
}

function validateArtifactGitignore(files, findings) {
  const text = files[".gitignore"];
  if (typeof text !== "string") return;
  text.split(/\r?\n/u).forEach((raw, offset) => {
    const line = raw.trim();
    const normalized = line.replace(/^\//u, "");
    if (line && !line.startsWith("#") && !line.startsWith("!") && (/^(?:dist|build|evidence)(?:\/|$)/u.test(normalized) || /^(?:receipt|review|release)(?:\.|\/|$)/u.test(normalized) || /^(?:\*\*\/)?\*\.(?:png|svg|pdf|pptx|mp4|wav)$/u.test(normalized))) findings.push(finding("DELIVERY_PATH_IGNORED", `.gitignore:${offset + 1}`, `artifact delivery path must not be ignored: ${line}`));
  });
}

function validateConcepts(model, findings) {
  const manifest = parseJson(model.files, "src/concepts/manifest.json", findings);
  const concepts = Array.isArray(manifest?.concepts) ? manifest.concepts : [];
  concepts.forEach((entry, offset) => {
    const match = typeof entry?.source === "string" ? entry.source.match(CONCEPT_SOURCE) : null;
    const sourcePath = `src/concepts/${entry?.source ?? "manifest.json"}`;
    if (!match || entry.index !== offset + 1 || Number(match?.groups.index) !== entry.index) {
      findings.push(finding("CONCEPT_SEQUENCE_INVALID", sourcePath, "concepts must use contiguous NNN-slug.logo.tsx sources"));
      return;
    }
    const source = model.files[sourcePath];
    if (typeof source !== "string") { findings.push(finding("CONCEPT_SOURCE_MISSING", sourcePath, "concept source is missing")); return; }
    const preview = `src/concepts/${entry.source.slice(0, -9)}.${sha256(source)}.png`;
    if (!(preview in model.files)) findings.push(finding("CONCEPT_PREVIEW_MISSING", preview, "current source-hash concept preview is required"));
  });
}

function validateMaster(model, findings) {
  for (const role of ["Mark", "Wordmark", "Lockup"]) {
    const filePath = `src/master/${role}.logo.tsx`;
    const source = model.files[filePath];
    if (typeof source !== "string") continue;
    if (!/<\s*svg\b/u.test(source) || MASTER_VECTOR_VIOLATION.test(source)) findings.push(finding("MASTER_VECTOR_VIOLATION", filePath, "master role must be a self-contained native-vector SVG component"));
    if ((source.match(/export\s+function\s+[A-Za-z][A-Za-z0-9]*\s*\(/gu) ?? []).length !== 1) findings.push(finding("MASTER_EXPORT_INVALID", filePath, "master role must export exactly one SVG component"));
  }
  for (const role of ["mark", "wordmark", "lockup"]) {
    const filePath = `build/master/${role}.svg`;
    const svg = model.files[filePath];
    if (typeof svg === "string" && (!/<svg\s[^>]*viewBox=/u.test(svg) || /\s(?:width|height)=/u.test(svg) || /<(?:image|text|foreignObject|script|style)\b/u.test(svg))) {
      findings.push(finding("MASTER_SVG_INVALID", filePath, "master SVG must use viewBox and contain no fixed size, raster, text, or script"));
    }
  }
}

function validateConstruction(model, findings) {
  const standard = parseJson(model.files, "src/construction/standard-grid.json", findings);
  const geometry = parseJson(model.files, "src/construction/geometry.json", findings);
  const fibonacci = parseJson(model.files, "src/construction/fibonacci.json", findings);
  if (!(Number(standard?.unit) > 0) || !(Number(standard?.clearSpace) > 0) || ![16, 32, 64].some((size) => size >= Number(standard?.minimumPixels))) {
    findings.push(finding("STANDARD_GRID_INVALID", "src/construction/standard-grid.json", "standard grid needs positive unit, clear space, and minimum size"));
  }
  if (!Array.isArray(geometry?.primitives) || geometry.primitives.length === 0 || !Array.isArray(geometry?.pathMappings) || geometry.pathMappings.length === 0) {
    findings.push(finding("GEOMETRY_MAPPING_INVALID", "src/construction/geometry.json", "geometry must map master paths to stable primitives"));
  }
  if (JSON.stringify(fibonacci?.sequence) !== JSON.stringify([1, 1, 2, 3, 5, 8, 13])) findings.push(finding("FIBONACCI_SEQUENCE_INVALID", "src/construction/fibonacci.json", "Fibonacci sequence must be 1,1,2,3,5,8,13"));
  if (!new Set(["structural", "optical-reference"]).has(fibonacci?.usage)) findings.push(finding("FIBONACCI_USAGE_INVALID", "src/construction/fibonacci.json", "Fibonacci usage must be structural or optical-reference"));
  const anchors = Array.isArray(fibonacci?.anchors) ? fibonacci.anchors : [];
  if (anchors.filter(({ kind }) => kind === "outline").length < 2 || anchors.filter(({ kind }) => kind === "negative-space" || kind === "turn").length < 1) {
    findings.push(finding("FIBONACCI_ANCHORS_INVALID", "src/construction/fibonacci.json", "Fibonacci mapping needs two outline anchors and one negative-space or turn anchor"));
  }
  const digest = masterSubjectDigest(model);
  for (const sheet of ["standard", "geometry", "fibonacci"]) for (const extension of ["png", "svg"]) {
    const filePath = `evidence/construction/${sheet}.${digest}.${extension}`;
    if (!(filePath in model.files)) findings.push(finding("CONSTRUCTION_SHEET_MISSING", filePath, `${sheet} ${extension.toUpperCase()} sheet must bind the current master digest`));
  }
}

export function validateLogoModel(model, { stage = "source" } = {}) {
  const findings = [];
  const files = model?.files ?? {};
  if (".logo-delivery-journal.json" in files) findings.push(finding("MUTATION_JOURNAL_OPEN", ".logo-delivery-journal.json", "an interrupted generated writer must be resumed or rolled back"));
  validateRequired(files, findings);
  validateArtifactGitignore(files, findings);
  if (model?.project?.artifactId !== model?.artifactId) findings.push(finding("ARTIFACT_ID_MISMATCH", "logo.project.json", "project artifactId must match directory id"));
  validateConcepts(model, findings);
  validateMaster(model, findings);
  validateConstruction(model, findings);
  if (stage === "release") {
    for (const filePath of [...logoOutputPaths(), "receipt.release.json"]) {
      if (!(filePath in files)) findings.push(finding("RELEASE_PATH_MISSING", filePath, `${filePath} is required for release`));
    }
    if ("receipt.release.json" in files && !validateLogoReceipt(model)) findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind current logo sources and outputs"));
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}

export function evaluateLogoWrite({ relativePath = "", toolName = "", writer = "" } = {}) {
  const normalized = relativePath.replaceAll("\\", "/");
  const match = normalized.match(/(?:^|\/)artifacts\/logo\/[^/]+\/(?<inside>.+)$/u);
  if (!match) return { decision: "allow" };
  const inside = match.groups.inside;
  const conceptPreview = /^src\/concepts\/.*\.png$/u.test(inside);
  if ((GENERATED_PATH.test(inside) || conceptPreview) && !writer.startsWith("logo-")) return { decision: "deny", code: "PROTECTED_WRITER_REQUIRED", message: `${inside} must be written by a logo guard tool, not ${toolName || "an unregistered tool"}` };
  return { decision: "allow" };
}
