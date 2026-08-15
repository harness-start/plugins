import { createHash, type BinaryLike } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { posix as path } from "node:path";
import { basename, join, relative, resolve } from "node:path";
import { projectInside, resolveWorkspaceRoot } from "@harness/core/artifact-paths";

export type FileContent = string | Buffer;
export type FileMap = Record<string, FileContent>;
export type DigestMap = Record<string, string>;
export type JsonRecord = Record<string, unknown>;

export type ContractFinding = {
  code: string;
  path: string;
  message: string;
};

export type PptxModel = {
  artifactId?: string | undefined;
  files?: FileMap | undefined;
  digests?: DigestMap | undefined;
  plan?: unknown;
  project?: unknown;
  tracked?: unknown[];
  ignored?: unknown[];
};

export type PptxValidateOptions = { stage?: unknown };
export type PptxWriteOptions = {
  relativePath?: string | undefined;
  toolName?: string | undefined;
  writer?: string | undefined;
  cwd?: string | undefined;
};
export type PptxWriteDecision =
  | { decision: "allow" }
  | { decision: "deny"; code: string; message: string };
export type PptxLoadLimits = {
  maxFiles?: number | undefined;
  maxBytesPerFile?: number | undefined;
};
export type PptxReceipt = {
  schemaVersion: number;
  plugin: string;
  artifactId: string | undefined;
  stage: string;
  subjectDigest: string;
  outputs: Record<string, string>;
};

const SLIDE_SOURCE = /^(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.ts$/u;
const GENERATED_PATH = /^(?:dist\/|evidence\.[^/]+\.json$|review\.[^/]+\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$)/u;
const SLIDE_OWNER_VIOLATION = /(?:\baddSlide\s*\(|\bnew\s+pptxgen\b|from\s+["']pptxgenjs["']|\b(?:writeFile|writeFileSync|createWriteStream|fetch|setTimeout|setInterval)\s*\(|\b(?:Date\.now|Math\.random)\s*\(|from\s+["']node:(?:fs|child_process)["'])/u;

function digest(value: BinaryLike): string {
  return createHash("sha256").update(value).digest("hex");
}

const isObject = (value: unknown): value is JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value);
const rec = (value: unknown): JsonRecord | undefined => isObject(value) ? value : undefined;
const asList = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const textOf = (value: unknown): string => Buffer.isBuffer(value) ? value.toString("utf8") : typeof value === "string" ? value : "";

function validateIndependentReviewFile(files: FileMap, filePath: string, schema: string, findings: ContractFinding[]): void {
  let review: unknown;
  try { review = JSON.parse(files[filePath] === undefined ? "null" : textOf(files[filePath])); } catch { review = null; }
  const reviewRec = rec(review);
  if (!review || reviewRec?.schema !== schema || reviewRec?.verdict !== "pass") {
    findings.push(finding("REVIEW_INVALID", filePath, "review must be a passing independent review bound to the current artifact"));
    return;
  }
  const reviewer = rec(reviewRec?.reviewer);
  if (!["human", "independent-agent"].includes(reviewer?.kind as string) || typeof reviewer?.sessionId !== "string" || !reviewer.sessionId) {
    findings.push(finding("REVIEWER_INVALID", filePath, "reviewer must declare kind and sessionId"));
    return;
  }
  if (reviewer.sessionId === (process.env.AI_EXPERTS_SESSION_ID || "unknown")) {
    findings.push(finding("REVIEW_SELF", filePath, "reviewer session must differ from the current release session"));
  }
}

function fileDigest(model: PptxModel | null | undefined, filePath: string): string {
  return model?.digests?.[filePath] ?? digest(model?.files?.[filePath] ?? "");
}

function isGeneratedSubjectPath(filePath: string): boolean {
  return filePath === ".pptx-delivery-journal.json"
    || GENERATED_PATH.test(filePath)
    || (filePath.startsWith("src/slides/") && filePath.endsWith(".png"));
}

export function computePptxSubjectDigest(model: PptxModel | null | undefined): string {
  const records = Object.entries(model?.files ?? {})
    .filter(([filePath]) => !isGeneratedSubjectPath(filePath))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath]) => `${filePath}\0${fileDigest(model, filePath)}\n`)
    .join("");
  return digest(records);
}

function releaseOutputPaths(model: PptxModel | null | undefined): string[] {
  return Object.keys(model?.files ?? {})
    .filter((filePath) =>
      filePath === `dist/${model?.artifactId}.pptx`
      || filePath === `dist/${model?.artifactId}.pdf`
      || /^dist\/pages\/[0-9]{3}\.png$/u.test(filePath)
      || /^src\/slides\/.+\.[0-9a-f]{64}\.png$/u.test(filePath)
      || filePath === "evidence.structure.json"
      || filePath === "evidence.accessibility.json"
      || filePath === "review.pptx.json"
      || filePath === "release.manifest.json")
    .sort();
}

export function createPptxReceipt(model: PptxModel, stage = "release"): PptxReceipt {
  if (stage !== "release") throw new Error(`unsupported PPTX receipt stage: ${stage}`);
  return {
    schemaVersion: 1,
    plugin: "pptx-project-delivery-guard",
    artifactId: model.artifactId,
    stage,
    subjectDigest: computePptxSubjectDigest(model),
    outputs: Object.fromEntries(releaseOutputPaths(model).map((filePath) => [filePath, fileDigest(model, filePath)])),
  };
}

export function validatePptxReceipt(model: PptxModel | null | undefined, stage = "release"): boolean {
  const receiptPath = `receipt.${stage}.json`;
  const text = model?.files?.[receiptPath];
  if (typeof text !== "string") return false;
  let receipt: unknown;
  try {
    receipt = JSON.parse(text);
  } catch {
    return false;
  }
  const expected = createPptxReceipt(model ?? {}, stage);
  if (!isObject(receipt)) return false;
  return receipt.schemaVersion === expected.schemaVersion
    && receipt.plugin === expected.plugin
    && receipt.artifactId === expected.artifactId
    && receipt.stage === expected.stage
    && receipt.subjectDigest === expected.subjectDigest
    && JSON.stringify(receipt.outputs) === JSON.stringify(expected.outputs);
}

function finding(code: string, pathName: string, message: string): ContractFinding {
  return { code, path: pathName, message };
}

function parseJson(files: FileMap, filePath: string, findings: ContractFinding[]): unknown {
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

function validateRequiredPaths(files: FileMap, findings: ContractFinding[]): void {
  for (const filePath of [
    ".gitignore",
    "package.json",
    "package-lock.json",
    "plan.contract.json",
    "plan.storyboard.json",
    "pptx.project.json",
    "src/deck.ts",
    "src/theme.ts",
    "src/slides/manifest.json",
  ]) {
    if (!(filePath in files)) {
      findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
    }
  }
}

function validateArtifactGitignore(files: FileMap, findings: ContractFinding[]): void {
  const text = files[".gitignore"];
  if (typeof text !== "string") return;
  for (const [offset, raw] of text.split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    const normalized = line.replace(/^\//u, "");
    if (/^(?:dist|build|evidence)(?:\/|$)/u.test(normalized)
      || /^(?:receipt|review|release)(?:\.|\/|$)/u.test(normalized)
      || /^(?:\*\*\/)?\*\.(?:png|svg|pdf|pptx|mp4|wav)$/u.test(normalized)) {
      findings.push(finding("DELIVERY_PATH_IGNORED", `.gitignore:${offset + 1}`, `artifact delivery path must not be ignored: ${line}`));
    }
  }
}

function validateSlideSource(files: FileMap, entry: unknown, findings: ContractFinding[]): void {
  const item = rec(entry);
  const sourceName = item?.source;
  const sourceMatch = typeof sourceName === "string" ? sourceName.match(SLIDE_SOURCE) : null;
  const sourcePath = sourceName ? path.join("src/slides", sourceName as string) : "src/slides/manifest.json";

  if (!sourceMatch) {
    findings.push(finding("SLIDE_NAME_INVALID", sourcePath, "slide source must use NNN-slug.ts"));
    return;
  }
  if (Number(sourceMatch.groups?.index) !== item?.index) {
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

export function validatePptxModel(model: PptxModel | null | undefined, { stage = "source" }: PptxValidateOptions = {}): ContractFinding[] {
  const findings: ContractFinding[] = [];
  const files = model?.files ?? {};
  if (".pptx-delivery-journal.json" in files) findings.push(finding("MUTATION_JOURNAL_OPEN", ".pptx-delivery-journal.json", "an interrupted generated writer must be resumed or rolled back"));
  validateRequiredPaths(files, findings);
  validateArtifactGitignore(files, findings);

  if (rec(model?.project)?.artifactId !== model?.artifactId) {
    findings.push(finding("ARTIFACT_ID_MISMATCH", "pptx.project.json", "project artifactId must match the directory id"));
  }

  const manifest = parseJson(files, "src/slides/manifest.json", findings);
  const manifestRec = rec(manifest);
  const slides = asList(manifestRec?.slides);
  if (manifest && !Array.isArray(manifestRec?.slides)) {
    findings.push(finding("MANIFEST_INVALID", "src/slides/manifest.json", "manifest slides must be an array"));
  }
  const indexes = new Set<unknown>();
  const ids = new Set<unknown>();
  slides.forEach((entry, offset) => {
    const item = rec(entry);
    if (item?.index !== offset + 1 || indexes.has(item?.index) || ids.has(item?.id)) {
      findings.push(finding("SLIDE_SEQUENCE_INVALID", "src/slides/manifest.json", "slide indexes and ids must be unique and contiguous"));
    }
    indexes.add(item?.index);
    ids.add(item?.id);
    validateSlideSource(files, entry, findings);
  });

  if (stage === "release") {
    for (const filePath of [
      `dist/${model?.artifactId}.pptx`,
      `dist/${model?.artifactId}.pdf`,
      "evidence.structure.json",
      "evidence.accessibility.json",
      "review.pptx.json",
      "release.manifest.json",
      "receipt.release.json",
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

export function evaluatePptxWrite({ relativePath = "", toolName = "", writer = "", cwd = "" }: PptxWriteOptions = {}): PptxWriteDecision {
  const inside = projectInside(relativePath, cwd, "pptx");
  if (!inside) return { decision: "allow" };
  const isSlidePreview = inside.startsWith("src/slides/") && inside.endsWith(".png");
  const isGenerated = inside === ".pptx-delivery-journal.json" || GENERATED_PATH.test(inside) || isSlidePreview;
  const approvedWriter = typeof writer === "string" && writer.startsWith("pptx-");

  if (isGenerated && !approvedWriter) {
    return {
      decision: "deny",
      code: "PROTECTED_WRITER_REQUIRED",
      message: `${inside} must be written by a pptx-project-delivery-guard tool, not ${toolName || "an unregistered tool"}`,
    };
  }
  return { decision: "allow" };
}

async function collectFiles(
  root: string,
  directory: string,
  files: Map<string, Buffer>,
  limits: { maxFiles: number; maxBytesPerFile: number },
): Promise<void> {
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

function textFiles(files: Map<string, Buffer>): FileMap {
  return Object.fromEntries([...files].map(([filePath, content]) => [filePath, content.toString("utf8")]));
}

function parseOptionalJson(files: Map<string, Buffer>, filePath: string): unknown {
  const content = files.get(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content.toString("utf8"));
  } catch {
    return null;
  }
}

export async function loadPptxProject(projectRoot: string, limits: PptxLoadLimits = {}): Promise<PptxModel> {
  const root = resolve(projectRoot);
  const files = new Map<string, Buffer>();
  await collectFiles(root, root, files, {
    maxFiles: limits.maxFiles ?? 2048,
    maxBytesPerFile: limits.maxBytesPerFile ?? 32 * 1024 * 1024,
  });
  const artifactId = basename(root);
  return {
    artifactId,
    files: textFiles(files),
    digests: Object.fromEntries([...files].map(([filePath, content]) => [filePath, digest(content)])),
    plan: parseOptionalJson(files, "plan.contract.json"),
    project: parseOptionalJson(files, "pptx.project.json"),
    tracked: [],
    ignored: [],
  };
}

export async function findPptxProjects(cwd: string, { maxProjects = 32 }: { maxProjects?: number } = {}): Promise<string[]> {
  const carrierRoot = join(resolveWorkspaceRoot(cwd, "pptx"), "artifacts", "pptx");
  let entries;
  try {
    entries = await readdir(carrierRoot, { withFileTypes: true });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const roots = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name)) continue;
    const root = join(carrierRoot, entry.name);
    try {
      const metadata = await lstat(join(root, "plan.contract.json"));
      if (metadata.isFile()) roots.push(root);
    } catch (error: unknown) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (roots.length > maxProjects) throw new Error("PROJECT_COUNT_LIMIT_EXCEEDED");
  }
  return roots.sort();
}
