// harness-source-hash: sha256:3422f99fc97f36ba94fd32ae1007511045c28d6aa6235660c13db0da475cf0f0

// core/src/artifact-paths.ts
import { basename, dirname, resolve } from "node:path";
var KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
function isKebabArtifactId(name) {
  return KEBAB.test(name);
}
function resolveWorkspaceRoot(cwd, carrier) {
  let current = resolve(cwd);
  while (current !== dirname(current)) {
    if (basename(dirname(current)) === carrier && basename(dirname(dirname(current))) === "artifacts") {
      return dirname(dirname(dirname(current)));
    }
    current = dirname(current);
  }
  return resolve(cwd);
}
function projectInside(relativePath = "", cwd = "", carrier) {
  const normalized = String(relativePath ?? "").replaceAll("\\", "/");
  const escaped = carrier.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const fromPath = normalized.match(new RegExp(`(?:^|/)artifacts/${escaped}/[^/]+/(?<inside>.+)$`, "u"));
  if (fromPath?.groups?.inside) return fromPath.groups.inside;
  const cwdNorm = String(cwd ?? "").replaceAll("\\", "/");
  if (new RegExp(`(?:^|/)artifacts/${escaped}/[^/]+(?:/|$)`, "u").test(cwdNorm)) {
    return normalized.replace(/^\.\//u, "");
  }
  return "";
}

// plugins/pptx-project-delivery-guard/src/lib/contract.ts
import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { posix as path } from "node:path";
import { basename as basename2, join, relative, resolve as resolve2 } from "node:path";
var SLIDE_SOURCE = /^(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.ts$/u;
var GENERATED_PATH = /^(?:dist\/|evidence\.[^/]+\.json$|review\.[^/]+\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$)/u;
var SLIDE_OWNER_VIOLATION = /(?:\baddSlide\s*\(|\bnew\s+pptxgen\b|from\s+["']pptxgenjs["']|\b(?:writeFile|writeFileSync|createWriteStream|fetch|setTimeout|setInterval)\s*\(|\b(?:Date\.now|Math\.random)\s*\(|from\s+["']node:(?:fs|child_process)["'])/u;
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
function validateIndependentReviewFile(files, filePath, schema, findings) {
  let review;
  try {
    review = JSON.parse(files[filePath] ?? "null");
  } catch {
    review = null;
  }
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
function fileDigest(model, filePath) {
  return model?.digests?.[filePath] ?? digest(model?.files?.[filePath] ?? "");
}
function isGeneratedSubjectPath(filePath) {
  return filePath === ".pptx-delivery-journal.json" || GENERATED_PATH.test(filePath) || filePath.startsWith("src/slides/") && filePath.endsWith(".png");
}
function computePptxSubjectDigest(model) {
  const records = Object.entries(model?.files ?? {}).filter(([filePath]) => !isGeneratedSubjectPath(filePath)).sort(([left], [right]) => left.localeCompare(right)).map(([filePath]) => `${filePath}\0${fileDigest(model, filePath)}
`).join("");
  return digest(records);
}
function releaseOutputPaths(model) {
  return Object.keys(model?.files ?? {}).filter((filePath) => filePath === `dist/${model.artifactId}.pptx` || filePath === `dist/${model.artifactId}.pdf` || /^dist\/pages\/[0-9]{3}\.png$/u.test(filePath) || /^src\/slides\/.+\.[0-9a-f]{64}\.png$/u.test(filePath) || filePath === "evidence.structure.json" || filePath === "evidence.accessibility.json" || filePath === "review.pptx.json" || filePath === "release.manifest.json").sort();
}
function createPptxReceipt(model, stage = "release") {
  if (stage !== "release") throw new Error(`unsupported PPTX receipt stage: ${stage}`);
  return {
    schemaVersion: 1,
    plugin: "pptx-project-delivery-guard",
    artifactId: model.artifactId,
    stage,
    subjectDigest: computePptxSubjectDigest(model),
    outputs: Object.fromEntries(releaseOutputPaths(model).map((filePath) => [filePath, fileDigest(model, filePath)]))
  };
}
function validatePptxReceipt(model, stage = "release") {
  const receiptPath = `receipt.${stage}.json`;
  const text = model?.files?.[receiptPath];
  if (typeof text !== "string") return false;
  let receipt;
  try {
    receipt = JSON.parse(text);
  } catch {
    return false;
  }
  const expected = createPptxReceipt(model, stage);
  return receipt?.schemaVersion === expected.schemaVersion && receipt?.plugin === expected.plugin && receipt?.artifactId === expected.artifactId && receipt?.stage === expected.stage && receipt?.subjectDigest === expected.subjectDigest && JSON.stringify(receipt?.outputs) === JSON.stringify(expected.outputs);
}
function finding(code, pathName, message) {
  return { code, path: pathName, message };
}
function parseJson(files, filePath, findings) {
  const text = files[filePath];
  if (typeof text !== "string") {
    findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    findings.push(finding("JSON_INVALID", filePath, `${filePath} must contain valid JSON`));
    return null;
  }
}
function validateRequiredPaths(files, findings) {
  for (const filePath of [
    ".gitignore",
    "package.json",
    "package-lock.json",
    "plan.contract.json",
    "plan.storyboard.json",
    "pptx.project.json",
    "src/deck.ts",
    "src/theme.ts",
    "src/slides/manifest.json"
  ]) {
    if (!(filePath in files)) {
      findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
    }
  }
}
function validateArtifactGitignore(files, findings) {
  const text = files[".gitignore"];
  if (typeof text !== "string") return;
  for (const [offset, raw] of text.split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    const normalized = line.replace(/^\//u, "");
    if (/^(?:dist|build|evidence)(?:\/|$)/u.test(normalized) || /^(?:receipt|review|release)(?:\.|\/|$)/u.test(normalized) || /^(?:\*\*\/)?\*\.(?:png|svg|pdf|pptx|mp4|wav)$/u.test(normalized)) {
      findings.push(finding("DELIVERY_PATH_IGNORED", `.gitignore:${offset + 1}`, `artifact delivery path must not be ignored: ${line}`));
    }
  }
}
function validateSlideSource(files, entry, findings) {
  const sourceName = entry?.source;
  const sourceMatch = typeof sourceName === "string" ? sourceName.match(SLIDE_SOURCE) : null;
  const sourcePath = sourceName ? path.join("src/slides", sourceName) : "src/slides/manifest.json";
  if (!sourceMatch) {
    findings.push(finding("SLIDE_NAME_INVALID", sourcePath, "slide source must use NNN-slug.ts"));
    return;
  }
  if (Number(sourceMatch.groups.index) !== entry.index) {
    findings.push(finding("SLIDE_INDEX_MISMATCH", sourcePath, "filename index must match manifest index"));
  }
  const source = files[sourcePath];
  if (typeof source !== "string") {
    findings.push(finding("SLIDE_SOURCE_MISSING", sourcePath, "manifest slide source is missing"));
    return;
  }
  const preview = `${sourcePath.slice(0, -3)}.${digest(source)}.png`;
  if (!(preview in files)) {
    findings.push(finding("PREVIEW_MISSING", preview, "current source-hash preview is required"));
  }
  if (SLIDE_OWNER_VIOLATION.test(source)) {
    findings.push(finding("SLIDE_OWNER_VIOLATION", sourcePath, "slide module may only modify the provided slide"));
  }
  const renderExports = source.match(/export\s+(?:async\s+)?function\s+renderSlide\s*\(/gu) ?? [];
  if (renderExports.length !== 1) {
    findings.push(finding("SLIDE_EXPORT_INVALID", sourcePath, "slide module must export exactly one renderSlide function"));
  }
  if (/from\s+["']\.\/[0-9]{3}-[^"']+["']/u.test(source)) {
    findings.push(finding("CROSS_SLIDE_IMPORT", sourcePath, "slide modules may not import sibling slides"));
  }
}
function validatePptxModel(model, { stage = "source" } = {}) {
  const findings = [];
  const files = model?.files ?? {};
  if (".pptx-delivery-journal.json" in files) findings.push(finding("MUTATION_JOURNAL_OPEN", ".pptx-delivery-journal.json", "an interrupted generated writer must be resumed or rolled back"));
  validateRequiredPaths(files, findings);
  validateArtifactGitignore(files, findings);
  if (model?.project?.artifactId !== model?.artifactId) {
    findings.push(finding("ARTIFACT_ID_MISMATCH", "pptx.project.json", "project artifactId must match the directory id"));
  }
  const manifest = parseJson(files, "src/slides/manifest.json", findings);
  const slides = Array.isArray(manifest?.slides) ? manifest.slides : [];
  if (manifest && !Array.isArray(manifest.slides)) {
    findings.push(finding("MANIFEST_INVALID", "src/slides/manifest.json", "manifest slides must be an array"));
  }
  const indexes = /* @__PURE__ */ new Set();
  const ids = /* @__PURE__ */ new Set();
  slides.forEach((entry, offset) => {
    if (entry?.index !== offset + 1 || indexes.has(entry?.index) || ids.has(entry?.id)) {
      findings.push(finding("SLIDE_SEQUENCE_INVALID", "src/slides/manifest.json", "slide indexes and ids must be unique and contiguous"));
    }
    indexes.add(entry?.index);
    ids.add(entry?.id);
    validateSlideSource(files, entry, findings);
  });
  if (stage === "release") {
    for (const filePath of [
      `dist/${model.artifactId}.pptx`,
      `dist/${model.artifactId}.pdf`,
      "evidence.structure.json",
      "evidence.accessibility.json",
      "review.pptx.json",
      "release.manifest.json",
      "receipt.release.json"
    ]) {
      if (!(filePath in files)) {
        findings.push(finding("RELEASE_PATH_MISSING", filePath, `${filePath} is required for release`));
      }
    }
    if (!validatePptxReceipt(model, "release")) {
      findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind current sources and every required output digest"));
    }
    validateIndependentReviewFile(files, "review.pptx.json", "pptx-project-delivery-guard/review/v1", findings);
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}
function evaluatePptxWrite({ relativePath = "", toolName = "", writer = "", cwd = "" } = {}) {
  const inside = projectInside(relativePath, cwd, "pptx");
  if (!inside) return { decision: "allow" };
  const isSlidePreview = inside.startsWith("src/slides/") && inside.endsWith(".png");
  const isGenerated = inside === ".pptx-delivery-journal.json" || GENERATED_PATH.test(inside) || isSlidePreview;
  const approvedWriter = typeof writer === "string" && writer.startsWith("pptx-");
  if (isGenerated && !approvedWriter) {
    return {
      decision: "deny",
      code: "PROTECTED_WRITER_REQUIRED",
      message: `${inside} must be written by a pptx-project-delivery-guard tool, not ${toolName || "an unregistered tool"}`
    };
  }
  return { decision: "allow" };
}
async function collectFiles(root, directory, files, limits) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (files.size >= limits.maxFiles) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
    const absolute = join(directory, entry.name);
    const relativePath = relative(root, absolute).replaceAll("\\", "/");
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${relativePath}`);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
      await collectFiles(root, absolute, files, limits);
      continue;
    }
    if (!entry.isFile()) continue;
    const metadata = await lstat(absolute);
    if (metadata.size > limits.maxBytesPerFile) throw new Error(`FILE_SIZE_LIMIT_EXCEEDED:${relativePath}`);
    files.set(relativePath, await readFile(absolute));
  }
}
function textFiles(files) {
  return Object.fromEntries([...files].map(([filePath, content]) => [filePath, content.toString("utf8")]));
}
function parseOptionalJson(files, filePath) {
  const content = files.get(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content.toString("utf8"));
  } catch {
    return null;
  }
}
async function loadPptxProject(projectRoot, limits = {}) {
  const root = resolve2(projectRoot);
  const files = /* @__PURE__ */ new Map();
  await collectFiles(root, root, files, {
    maxFiles: limits.maxFiles ?? 2048,
    maxBytesPerFile: limits.maxBytesPerFile ?? 32 * 1024 * 1024
  });
  const artifactId = basename2(root);
  return {
    artifactId,
    files: textFiles(files),
    digests: Object.fromEntries([...files].map(([filePath, content]) => [filePath, digest(content)])),
    plan: parseOptionalJson(files, "plan.contract.json"),
    project: parseOptionalJson(files, "pptx.project.json"),
    tracked: [],
    ignored: []
  };
}
async function findPptxProjects(cwd, { maxProjects = 32 } = {}) {
  const carrierRoot = join(resolveWorkspaceRoot(cwd, "pptx"), "artifacts", "pptx");
  let entries;
  try {
    entries = await readdir(carrierRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const roots = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name)) continue;
    const root = join(carrierRoot, entry.name);
    try {
      const metadata = await lstat(join(root, "plan.contract.json"));
      if (metadata.isFile()) roots.push(root);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (roots.length > maxProjects) throw new Error("PROJECT_COUNT_LIMIT_EXCEEDED");
  }
  return roots.sort();
}

export {
  isKebabArtifactId,
  resolveWorkspaceRoot,
  createPptxReceipt,
  validatePptxReceipt,
  validatePptxModel,
  evaluatePptxWrite,
  loadPptxProject,
  findPptxProjects
};
