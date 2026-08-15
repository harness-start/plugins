import { createHash, type BinaryLike } from "node:crypto";

export type FileContent = string | Buffer;
export type FileMap = Record<string, FileContent>;
export type DigestMap = Record<string, string>;
export type BytesMap = Record<string, Buffer>;
export type JsonRecord = Record<string, unknown>;

export type ContractFinding = {
  code: string;
  path: string;
  message: string;
};

export type PosterModel = {
  artifactId?: string | undefined;
  files?: FileMap | undefined;
  bytes?: BytesMap | undefined;
  digests?: DigestMap | undefined;
  plan?: unknown;
  project?: unknown;
};

export type PosterValidateOptions = {
  stage?: unknown;
};

export type PosterWriteOptions = {
  relativePath?: string | undefined;
  toolName?: string | undefined;
  writer?: string | undefined;
  cwd?: string | undefined;
};

export type PosterWriteDecision =
  | { decision: "allow" }
  | { decision: "deny"; code: string; message: string };

export type PosterReceipt = {
  schemaVersion: number;
  plugin: string;
  artifactId: string | undefined;
  stage: string;
  subjectDigest: string;
  outputs: Record<string, string>;
};

const VARIANT_DIRECTORY = /^(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)$/u;
const LAYER_SOURCE = /^(?<index>[0-9]{3})-(?<role>background|media|overlay|decoration|title|body|metadata|brand|cta)-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.tsx$/u;
const GENERATED_PATH = /^(?:dist\/|evidence(?:\.[^/]+)?(?:\/|\.json$)|review\.poster\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$)/u;
const OWNER_VIOLATION = /(?:\bzIndex\s*:|from\s+["'](?:satori|@resvg\/resvg-js|node:fs|node:child_process)["']|\b(?:fetch|setTimeout|setInterval)\s*\(|\b(?:Date\.now|Math\.random)\s*\(|\b(?:useState|useEffect|useLayoutEffect)\s*\(|<\s*(?:script|style|link|iframe)\b|https?:\/\/)/u;
const RECEIPT_EXCLUDED_PATH = /^(?:dist\/|evidence(?:\.|\/)|review\.poster\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$|\.poster-delivery-journal\.json$)/u;
const PROOF_PATH = /^src\/variants\/.+\.[0-9a-f]{64}\.(?:png|svg)$/u;

const sha256 = (value: BinaryLike): string => createHash("sha256").update(value).digest("hex");
const finding = (code: string, path: string, message: string): ContractFinding => ({ code, path, message });
const isObject = (value: unknown): value is JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value);
const rec = (value: unknown): JsonRecord | undefined => isObject(value) ? value : undefined;
const asList = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const textOf = (value: unknown): string => Buffer.isBuffer(value) ? value.toString("utf8") : typeof value === "string" ? value : "";

function validateIndependentReviewFile(model: PosterModel | null | undefined, filePath: string, schema: string, findings: ContractFinding[]): void {
  const files = model?.files ?? {};
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
  if (reviewRec?.subjectDigest !== computePosterSubjectDigest(model)) {
    findings.push(finding("REVIEW_SUBJECT_STALE", filePath, "review subjectDigest must match the current source subject"));
  }
}
const fileDigest = (model: PosterModel | null | undefined, filePath: string): string => model?.digests?.[filePath] ?? sha256(rawBytes(model, filePath) ?? "");

function rawBytes(model: PosterModel | null | undefined, filePath: string): Buffer {
  const fromBytes = model?.bytes?.[filePath];
  if (Buffer.isBuffer(fromBytes)) return fromBytes;
  const value = model?.files?.[filePath];
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") return Buffer.from(value, "utf8");
  return Buffer.alloc(0);
}

function pngProofValid(bytes: Buffer): boolean {
  return Buffer.isBuffer(bytes)
    && bytes.byteLength >= 8
    && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
}

function svgProofValid(bytes: Buffer): boolean {
  return Buffer.isBuffer(bytes) && /<svg\b/iu.test(bytes.toString("utf8"));
}

function digestFileMap(model: PosterModel | null | undefined, predicate: (filePath: string) => boolean): string {
  const entries = Object.entries(model?.files ?? {})
    .filter(([filePath, value]) => predicate(filePath) && typeof value === "string")
    .sort(([left], [right]) => left.localeCompare(right));
  return sha256(entries.map(([filePath]) => `${filePath}\0${fileDigest(model, filePath)}\n`).join(""));
}

export function computePosterSubjectDigest(model: PosterModel | null | undefined): string {
  return digestFileMap(model, (filePath) => !RECEIPT_EXCLUDED_PATH.test(filePath) && !PROOF_PATH.test(filePath));
}

function posterOutputPaths(model: PosterModel | null | undefined): string[] {
  const files = model?.files ?? {};
  const manifest = (() => {
    try {
      return JSON.parse(files["src/variants/manifest.json"] === undefined ? "{}" : textOf(files["src/variants/manifest.json"]));
    } catch {
      return {};
    }
  })();
  const variants = asList(rec(manifest)?.variants);
  return [
    ...variants.map((variant) => `dist/${model?.artifactId}.${rec(variant)?.id}.png`),
    ...Object.keys(files).filter((filePath) => PROOF_PATH.test(filePath)).sort(),
    "evidence.accessibility.json",
    "review.poster.json",
    "release.manifest.json",
  ];
}

export function createPosterReceipt(model: PosterModel | null | undefined): PosterReceipt {
  return {
    schemaVersion: 1,
    plugin: "poster-project-delivery-guard",
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest: computePosterSubjectDigest(model),
    outputs: Object.fromEntries(posterOutputPaths(model).map((filePath) => [filePath, fileDigest(model, filePath)])),
  };
}

export function validatePosterReceipt(model: PosterModel | null | undefined): boolean {
  const serialized = model?.files?.["receipt.release.json"];
  if (typeof serialized !== "string") return false;
  try {
    const actual: unknown = JSON.parse(serialized);
    const expected = createPosterReceipt(model);
    if (!isObject(actual)) return false;
    return actual.schemaVersion === expected.schemaVersion
      && actual.plugin === expected.plugin
      && actual.artifactId === expected.artifactId
      && actual.stage === expected.stage
      && actual.subjectDigest === expected.subjectDigest
      && JSON.stringify(actual.outputs) === JSON.stringify(expected.outputs);
  } catch {
    return false;
  }
}

function parseJson(files: FileMap, filePath: string, findings: ContractFinding[]): unknown {
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

function validateRequired(files: FileMap, findings: ContractFinding[]): void {
  for (const filePath of [
    ".gitignore", "package.json", "package-lock.json", "plan.contract.json",
    "plan.assets.json", "poster.project.json", "src/render.ts", "src/compose.ts",
    "src/theme.ts", "src/variants/manifest.json",
  ]) if (!(filePath in files)) findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
}

function validateArtifactGitignore(files: FileMap, findings: ContractFinding[]): void {
  const text = files[".gitignore"];
  if (typeof text !== "string") return;
  text.split(/\r?\n/u).forEach((raw, offset) => {
    const line = raw.trim();
    const normalized = line.replace(/^\//u, "");
    if (line && !line.startsWith("#") && !line.startsWith("!") && (/^(?:dist|build|evidence)(?:\/|$)/u.test(normalized) || /^(?:receipt|review|release)(?:\.|\/|$)/u.test(normalized) || /^(?:\*\*\/)?\*\.(?:png|svg|pdf|pptx|mp4|wav)$/u.test(normalized))) findings.push(finding("DELIVERY_PATH_IGNORED", `.gitignore:${offset + 1}`, `artifact delivery path must not be ignored: ${line}`));
  });
}

function validateLayer(model: PosterModel | null | undefined, directory: string, entry: unknown, findings: ContractFinding[]): void {
  const files = model?.files ?? {};
  const item = rec(entry);
  const sourceName = item?.source;
  const match = typeof sourceName === "string" ? sourceName.match(LAYER_SOURCE) : null;
  const sourcePath = `src/variants/${directory}/layers/${sourceName ?? "manifest.json"}`;
  if (!match) {
    findings.push(finding("LAYER_NAME_INVALID", sourcePath, "layer source must use NNN-role-slug.tsx"));
    return;
  }
  if (Number(match.groups?.index) !== item?.index || match.groups?.role !== item?.role) {
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
    else if (!(extension === "png" ? pngProofValid(rawBytes(model, proof)) : svgProofValid(rawBytes(model, proof)))) {
      findings.push(finding("LAYER_PROOF_INVALID", proof, `current ${extension.toUpperCase()} proof must be a real ${extension.toUpperCase()} document, not a stub`));
    }
  }
  if (OWNER_VIOLATION.test(source)) findings.push(finding("LAYER_OWNER_VIOLATION", sourcePath, "layer violates the pure Satori TSX boundary"));
  if ((source.match(/export\s+(?:async\s+)?function\s+buildLayer\s*\(/gu) ?? []).length !== 1) {
    findings.push(finding("LAYER_EXPORT_INVALID", sourcePath, "layer must export exactly one buildLayer function"));
  }
  if (/from\s+["']\.\/[0-9]{3}-[^"']+["']/u.test(source)) findings.push(finding("CROSS_LAYER_IMPORT", sourcePath, "layers may not import sibling layers"));
}

function validateAccessibilityEvidence(model: PosterModel | null | undefined, findings: ContractFinding[]): void {
  const filePath = "evidence.accessibility.json";
  if (!(filePath in (model?.files ?? {}))) return;
  let record: unknown;
  try { record = JSON.parse(textOf(model?.files?.[filePath]) || "null"); } catch { record = null; }
  const recd = rec(record);
  const checks = asList(recd?.checks);
  const ok = recd
    && recd.schema === "poster-project-delivery-guard/accessibility/v1"
    && recd.artifactId === model?.artifactId
    && recd.subjectDigest === computePosterSubjectDigest(model)
    && typeof recd.tool === "string"
    && recd.tool.trim()
    && ["pass", "fail"].includes(recd.verdict as string)
    && Array.isArray(recd.checks)
    && checks.length > 0
    && checks.every((check) => typeof rec(check)?.id === "string" && rec(check)?.id && typeof rec(check)?.status === "string" && rec(check)?.status);
  if (!ok) findings.push(finding("ACCESSIBILITY_EVIDENCE_INVALID", filePath, "accessibility evidence must bind the current subject, name a tool, and record at least one check"));
}

function validateReleaseManifestFile(model: PosterModel | null | undefined, variants: unknown[], findings: ContractFinding[]): void {
  const filePath = "release.manifest.json";
  if (!(filePath in (model?.files ?? {}))) return;
  let record: unknown;
  try { record = JSON.parse(textOf(model?.files?.[filePath]) || "null"); } catch { record = null; }
  const recordRec = rec(record);
  const expectedIds = variants.map((variant) => rec(variant)?.id).filter(Boolean);
  const listed = asList(recordRec?.variants);
  const ok = recordRec
    && recordRec.schema === "poster-project-delivery-guard/release-manifest/v1"
    && recordRec.artifactId === model?.artifactId
    && recordRec.subjectDigest === computePosterSubjectDigest(model)
    && expectedIds.length > 0
    && listed.length === expectedIds.length
    && expectedIds.every((id, index) => rec(listed[index])?.id === id)
    && listed.every((entry) => rec(entry)?.output === `dist/${model?.artifactId}.${rec(entry)?.id}.png`);
  if (!ok) findings.push(finding("RELEASE_MANIFEST_INVALID", filePath, "release manifest must list current variants and their dist output paths"));
}

export function validatePosterModel(model: PosterModel | null | undefined, { stage = "source" }: PosterValidateOptions = {}): ContractFinding[] {
  const findings: ContractFinding[] = [];
  const files = model?.files ?? {};
  if (".poster-delivery-journal.json" in files) findings.push(finding("MUTATION_JOURNAL_OPEN", ".poster-delivery-journal.json", "an interrupted generated writer must be resumed or rolled back"));
  validateRequired(files, findings);
  validateArtifactGitignore(files, findings);
  if (rec(model?.project)?.artifactId !== model?.artifactId) findings.push(finding("ARTIFACT_ID_MISMATCH", "poster.project.json", "project artifactId must match directory id"));
  const manifest = parseJson(files, "src/variants/manifest.json", findings);
  const variants = asList(rec(manifest)?.variants);
  variants.forEach((variant, offset) => {
    const item = rec(variant);
    const match = typeof item?.directory === "string" ? item.directory.match(VARIANT_DIRECTORY) : null;
    if (!match || item?.index !== offset + 1 || Number(match.groups?.index) !== item?.index) {
      findings.push(finding("VARIANT_SEQUENCE_INVALID", "src/variants/manifest.json", "variants must be unique, contiguous NNN-slug directories"));
      return;
    }
    const layersPath = `src/variants/${item.directory}/layers/manifest.json`;
    const layersManifest = parseJson(files, layersPath, findings);
    const layers = asList(rec(layersManifest)?.layers);
    const ids = new Set<unknown>();
    layers.forEach((entry, layerOffset) => {
      const layer = rec(entry);
      if (layer?.index !== layerOffset + 1 || ids.has(layer?.source)) findings.push(finding("LAYER_SEQUENCE_INVALID", layersPath, "layer indexes and sources must be unique and contiguous"));
      ids.add(layer?.source);
      validateLayer(model, String(item.directory), entry, findings);
    });
    if (rec(layers[0])?.role !== "background") findings.push(finding("BACKGROUND_LAYER_REQUIRED", layersPath, "background must be the first painted layer"));
  });
  if (stage === "release") {
    const expected = variants.map((variant) => `dist/${model?.artifactId}.${rec(variant)?.id}.png`);
    for (const filePath of [...expected, "evidence.accessibility.json", "review.poster.json", "release.manifest.json", "receipt.release.json"]) {
      if (!(filePath in files)) findings.push(finding("RELEASE_PATH_MISSING", filePath, `${filePath} is required for release`));
    }
    validateIndependentReviewFile(model, "review.poster.json", "poster-project-delivery-guard/review/v1", findings);
    validateAccessibilityEvidence(model, findings);
    validateReleaseManifestFile(model, variants, findings);
    if ("receipt.release.json" in files && !validatePosterReceipt(model)) {
      findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind the current source subject and release outputs"));
    }
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}

function posterProjectInside(relativePath = "", cwd = ""): string {
  const normalized = String(relativePath ?? "").replaceAll("\\", "/");
  const fromPath = normalized.match(/(?:^|\/)artifacts\/poster\/[^/]+\/(?<inside>.+)$/u);
  if (fromPath?.groups?.inside) return fromPath.groups.inside;
  const cwdNorm = String(cwd ?? "").replaceAll("\\", "/");
  if (/(?:^|\/)artifacts\/poster\/[^/]+(?:\/|$)/u.test(cwdNorm)) {
    return normalized.replace(/^\.\//u, "");
  }
  return "";
}

export function evaluatePosterWrite({ relativePath = "", toolName = "", writer = "", cwd = "" }: PosterWriteOptions = {}): PosterWriteDecision {
  const inside = posterProjectInside(relativePath, cwd);
  if (!inside) return { decision: "allow" };
  const isProof = inside.startsWith("src/variants/") && /\.(?:png|svg)$/u.test(inside);
  if ((GENERATED_PATH.test(inside) || isProof) && !writer.startsWith("poster-")) {
    return { decision: "deny", code: "PROTECTED_WRITER_REQUIRED", message: `${inside} must be written by a poster guard tool, not ${toolName || "an unregistered tool"}` };
  }
  return { decision: "allow" };
}
