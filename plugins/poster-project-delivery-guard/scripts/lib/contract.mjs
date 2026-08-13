import { createHash } from "node:crypto";

const VARIANT_DIRECTORY = /^(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)$/u;
const LAYER_SOURCE = /^(?<index>[0-9]{3})-(?<role>background|media|overlay|decoration|title|body|metadata|brand|cta)-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.tsx$/u;
const GENERATED_PATH = /^(?:dist\/|evidence(?:\.[^/]+)?(?:\/|\.json$)|review\.poster\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$)/u;
const OWNER_VIOLATION = /(?:\bzIndex\s*:|from\s+["'](?:satori|@resvg\/resvg-js|node:fs|node:child_process)["']|\b(?:fetch|setTimeout|setInterval)\s*\(|\b(?:Date\.now|Math\.random)\s*\(|\b(?:useState|useEffect|useLayoutEffect)\s*\(|<\s*(?:script|style|link|iframe)\b|https?:\/\/)/u;
const RECEIPT_EXCLUDED_PATH = /^(?:dist\/|evidence(?:\.|\/)|review\.poster\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$|\.poster-delivery-journal\.json$)/u;
const PROOF_PATH = /^src\/variants\/.+\.[0-9a-f]{64}\.(?:png|svg)$/u;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const finding = (code, path, message) => ({ code, path, message });

function validateIndependentReviewFile(files, filePath, schema, findings) {
  let review;
  try { review = JSON.parse(files[filePath] ?? "null"); } catch { review = null; }
  if (!review || review.schema !== schema || review.verdict !== "pass") {
    findings.push(finding("REVIEW_INVALID", filePath, "review must be a passing independent review bound to the current artifact"));
    return;
  }
  if (!["human", "independent-agent"].includes(review.reviewer?.kind) || typeof review.reviewer?.sessionId !== "string" || !review.reviewer.sessionId) {
    findings.push(finding("REVIEWER_INVALID", filePath, "reviewer must declare kind and sessionId"));
    return;
  }
  if (review.reviewer.sessionId === (process.env.AI_EXPERTS_SESSION_ID || "unknown")) {
    findings.push(finding("REVIEW_SELF", filePath, "reviewer session must differ from the current release session"));
  }
}
const fileDigest = (model, filePath) => model?.digests?.[filePath] ?? sha256(model?.files?.[filePath] ?? "");

function digestFileMap(model, predicate) {
  const entries = Object.entries(model?.files ?? {})
    .filter(([filePath, value]) => predicate(filePath) && typeof value === "string")
    .sort(([left], [right]) => left.localeCompare(right));
  return sha256(entries.map(([filePath]) => `${filePath}\0${fileDigest(model, filePath)}\n`).join(""));
}

export function computePosterSubjectDigest(model) {
  return digestFileMap(model, (filePath) => !RECEIPT_EXCLUDED_PATH.test(filePath) && !PROOF_PATH.test(filePath));
}

function posterOutputPaths(model) {
  const files = model?.files ?? {};
  const manifest = (() => {
    try {
      return JSON.parse(files["src/variants/manifest.json"] ?? "{}");
    } catch {
      return {};
    }
  })();
  const variants = Array.isArray(manifest?.variants) ? manifest.variants : [];
  return [
    ...variants.map(({ id }) => `dist/${model.artifactId}.${id}.png`),
    ...Object.keys(files).filter((filePath) => PROOF_PATH.test(filePath)).sort(),
    "evidence.accessibility.json",
    "review.poster.json",
    "release.manifest.json",
  ];
}

export function createPosterReceipt(model) {
  const files = model?.files ?? {};
  return {
    schemaVersion: 1,
    plugin: "poster-project-delivery-guard",
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest: computePosterSubjectDigest(model),
    outputs: Object.fromEntries(posterOutputPaths(model).map((filePath) => [filePath, fileDigest(model, filePath)])),
  };
}

export function validatePosterReceipt(model) {
  const serialized = model?.files?.["receipt.release.json"];
  if (typeof serialized !== "string") return false;
  try {
    const actual = JSON.parse(serialized);
    const expected = createPosterReceipt(model);
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
  try {
    return JSON.parse(files[filePath]);
  } catch {
    findings.push(finding("JSON_INVALID", filePath, `${filePath} must contain valid JSON`));
    return null;
  }
}

function validateRequired(files, findings) {
  for (const filePath of [
    ".gitignore", "package.json", "package-lock.json", "plan.contract.json",
    "plan.assets.json", "poster.project.json", "src/render.ts", "src/compose.ts",
    "src/theme.ts", "src/variants/manifest.json",
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

function validateLayer(files, directory, entry, findings) {
  const sourceName = entry?.source;
  const match = typeof sourceName === "string" ? sourceName.match(LAYER_SOURCE) : null;
  const sourcePath = `src/variants/${directory}/layers/${sourceName ?? "manifest.json"}`;
  if (!match) {
    findings.push(finding("LAYER_NAME_INVALID", sourcePath, "layer source must use NNN-role-slug.tsx"));
    return;
  }
  if (Number(match.groups.index) !== entry.index || match.groups.role !== entry.role) {
    findings.push(finding("LAYER_MANIFEST_MISMATCH", sourcePath, "layer filename must match manifest index and role"));
  }
  const source = files[sourcePath];
  if (typeof source !== "string") {
    findings.push(finding("LAYER_SOURCE_MISSING", sourcePath, "manifest layer source is missing"));
    return;
  }
  const stem = sourcePath.slice(0, -4);
  const digest = sha256(source);
  for (const extension of ["png", "svg"]) {
    const proof = `${stem}.${digest}.${extension}`;
    if (!(proof in files)) findings.push(finding("LAYER_PROOF_MISSING", proof, `current ${extension.toUpperCase()} proof is required`));
  }
  if (OWNER_VIOLATION.test(source)) findings.push(finding("LAYER_OWNER_VIOLATION", sourcePath, "layer violates the pure Satori TSX boundary"));
  if ((source.match(/export\s+(?:async\s+)?function\s+buildLayer\s*\(/gu) ?? []).length !== 1) {
    findings.push(finding("LAYER_EXPORT_INVALID", sourcePath, "layer must export exactly one buildLayer function"));
  }
  if (/from\s+["']\.\/[0-9]{3}-[^"']+["']/u.test(source)) findings.push(finding("CROSS_LAYER_IMPORT", sourcePath, "layers may not import sibling layers"));
}

export function validatePosterModel(model, { stage = "source" } = {}) {
  const findings = [];
  const files = model?.files ?? {};
  if (".poster-delivery-journal.json" in files) findings.push(finding("MUTATION_JOURNAL_OPEN", ".poster-delivery-journal.json", "an interrupted generated writer must be resumed or rolled back"));
  validateRequired(files, findings);
  validateArtifactGitignore(files, findings);
  if (model?.project?.artifactId !== model?.artifactId) findings.push(finding("ARTIFACT_ID_MISMATCH", "poster.project.json", "project artifactId must match directory id"));
  const manifest = parseJson(files, "src/variants/manifest.json", findings);
  const variants = Array.isArray(manifest?.variants) ? manifest.variants : [];
  variants.forEach((variant, offset) => {
    const match = typeof variant?.directory === "string" ? variant.directory.match(VARIANT_DIRECTORY) : null;
    if (!match || variant.index !== offset + 1 || Number(match?.groups.index) !== variant.index) {
      findings.push(finding("VARIANT_SEQUENCE_INVALID", "src/variants/manifest.json", "variants must be unique, contiguous NNN-slug directories"));
      return;
    }
    const layersPath = `src/variants/${variant.directory}/layers/manifest.json`;
    const layersManifest = parseJson(files, layersPath, findings);
    const layers = Array.isArray(layersManifest?.layers) ? layersManifest.layers : [];
    const ids = new Set();
    layers.forEach((entry, layerOffset) => {
      if (entry?.index !== layerOffset + 1 || ids.has(entry?.source)) findings.push(finding("LAYER_SEQUENCE_INVALID", layersPath, "layer indexes and sources must be unique and contiguous"));
      ids.add(entry?.source);
      validateLayer(files, variant.directory, entry, findings);
    });
    if (layers[0]?.role !== "background") findings.push(finding("BACKGROUND_LAYER_REQUIRED", layersPath, "background must be the first painted layer"));
  });
  if (stage === "release") {
    const expected = variants.map(({ id }) => `dist/${model.artifactId}.${id}.png`);
    for (const filePath of [...expected, "evidence.accessibility.json", "review.poster.json", "release.manifest.json", "receipt.release.json"]) {
      if (!(filePath in files)) findings.push(finding("RELEASE_PATH_MISSING", filePath, `${filePath} is required for release`));
    }
    validateIndependentReviewFile(files, "review.poster.json", "poster-project-delivery-guard/review/v1", findings);
    if ("receipt.release.json" in files && !validatePosterReceipt(model)) {
      findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind the current source subject and release outputs"));
    }
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}

export function evaluatePosterWrite({ relativePath = "", toolName = "", writer = "" } = {}) {
  const normalized = relativePath.replaceAll("\\", "/");
  const match = normalized.match(/(?:^|\/)artifacts\/poster\/[^/]+\/(?<inside>.+)$/u);
  if (!match) return { decision: "allow" };
  const inside = match.groups.inside;
  const isProof = inside.startsWith("src/variants/") && /\.(?:png|svg)$/u.test(inside);
  if ((GENERATED_PATH.test(inside) || isProof) && !writer.startsWith("poster-")) {
    return { decision: "deny", code: "PROTECTED_WRITER_REQUIRED", message: `${inside} must be written by a poster guard tool, not ${toolName || "an unregistered tool"}` };
  }
  return { decision: "allow" };
}
