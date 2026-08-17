import { createHash, type BinaryLike } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { basename, dirname, extname, join, posix, relative, resolve, sep } from "node:path";

export const PLAN_SCHEMA = "diagram-production/plan/v1";
export const DESIGN_SYSTEM_SCHEMA = "diagram-production/design-system/v1";
export const PROJECT_SCHEMA = "diagram-production/project/v1";
export const SOURCE_SCHEMA = "diagram-production/source/v1";
export const IMPORT_LEDGER_SCHEMA = "diagram-production/import-ledger/v1";
export const RENDER_EVIDENCE_SCHEMA = "diagram-production/render-evidence/v1";
export const PROBE_EVIDENCE_SCHEMA = "diagram-production/probe-evidence/v1";
export const REVIEW_INPUT_SCHEMA = "diagram-production/review-input/v1";
export const REVIEW_SCHEMA = "diagram-production/review/v1";
export const RELEASE_MANIFEST_SCHEMA = "diagram-production/release-manifest/v1";
export const RECEIPT_SCHEMA = "diagram-production/receipt/v1";

export const DIAGRAM_TYPES = [
  "architecture", "it-current-state", "flowchart", "sequence", "state-machine",
  "er", "timeline", "swimlane", "quadrant", "radar", "loop", "nested", "tree",
  "org-chart", "layer-stack", "venn", "pyramid", "bar", "line", "gantt", "scatter",
  "high-level", "process", "medallion", "data-flow", "dp-integration", "dp-security-matrix",
] as const;

export type DiagramType = (typeof DIAGRAM_TYPES)[number];
export type DiagramStage = "source" | "design" | "render" | "probe" | "review" | "release";
export type FileContent = string | Buffer | null;
export type FileMap = Record<string, FileContent>;
export type DigestMap = Record<string, string>;
export type JsonRecord = Record<string, unknown>;
export type ContractFinding = { code: string; path: string; message: string };
export type DiagramModel = {
  artifactId?: string;
  root?: string;
  files?: FileMap;
  digests?: DigestMap;
  sizes?: Record<string, number>;
  plan?: unknown;
  project?: unknown;
};
export type DiagramReceipt = {
  schema: string;
  plugin: string;
  artifactId: string | undefined;
  stage: "release";
  subjectDigest: string;
  outputs: Record<string, string>;
};

const STAGES = new Set<DiagramStage>(["source", "design", "render", "probe", "review", "release"]);
const STAGE_RANK: Record<DiagramStage, number> = { source: 0, design: 1, render: 2, probe: 3, review: 4, release: 5 };
const GENERATED = /^(?:dist\/|evidence\.[^/]+\.json$|review\.diagram\.json$|release\.manifest\.json$|receipt\.release\.json$)/u;
const TEXT_EXTENSIONS = new Set([".json", ".md", ".mjs", ".ts", ".txt", ".xml", ".html", ".svg"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", ".cache", ".tmp"]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const digest = (value: BinaryLike) => createHash("sha256").update(value).digest("hex");
const isObject = (value: unknown): value is JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value);
const rec = (value: unknown): JsonRecord | undefined => isObject(value) ? value : undefined;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const bytesOf = (value: FileContent | undefined) => Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : "");
const finding = (code: string, path: string, message: string): ContractFinding => ({ code, path, message });
const stageAtLeast = (stage: DiagramStage, expected: DiagramStage) => STAGE_RANK[stage] >= STAGE_RANK[expected];

function hasUnsafeSvgReference(text: string) {
  if (/<\s*(?:script|foreignObject|iframe|object|embed)\b|\bon\w+\s*=|@import\b/iu.test(text)) return true;
  for (const match of text.matchAll(/(?:href|src)\s*=\s*["']([^"']*)["']/giu)) {
    if (!/^(?:#|data:image\/(?:png|jpeg|gif|webp);base64,)/iu.test(match[1] ?? "")) return true;
  }
  for (const match of text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/giu)) {
    if (!/^(?:#|data:(?:image|font)\/)/iu.test(match[1] ?? "")) return true;
  }
  return false;
}

function parseJson(files: FileMap, path: string, findings: ContractFinding[]): unknown {
  const value = files[path];
  if (typeof value !== "string") {
    findings.push(finding("REQUIRED_PATH_MISSING", path, `${path} is required and must be UTF-8 JSON`));
    return null;
  }
  try { return JSON.parse(value) as unknown; }
  catch { findings.push(finding("JSON_INVALID", path, `${path} must contain valid JSON`)); return null; }
}

function schemaRecord(files: FileMap, path: string, schema: string, code: string, findings: ContractFinding[]) {
  const value = parseJson(files, path, findings);
  const record = rec(value);
  if (value !== null && (!record || record.schema !== schema)) findings.push(finding(code, path, `${path} must use schema ${schema}`));
  return record;
}

function isGeneratedPath(path: string) {
  return path === ".diagram-delivery-journal.json" || GENERATED.test(path);
}

function fileDigest(model: DiagramModel | null | undefined, path: string) {
  return model?.digests?.[path] ?? digest(bytesOf(model?.files?.[path]));
}

export function computeDiagramSubjectDigest(model: DiagramModel | null | undefined) {
  const records = Object.keys(model?.files ?? {}).filter((path) => !isGeneratedPath(path)).sort()
    .map((path) => `${path}\0${fileDigest(model, path)}\n`).join("");
  return digest(records);
}

function outputsFor(model: DiagramModel) {
  return Object.keys(model.files ?? {}).filter((path) => GENERATED.test(path) && path !== "receipt.release.json").sort();
}

export function createDiagramReceipt(model: DiagramModel, stage = "release"): DiagramReceipt {
  if (stage !== "release") throw new Error(`unsupported diagram receipt stage: ${stage}`);
  return {
    schema: RECEIPT_SCHEMA,
    plugin: "diagram-production",
    artifactId: model.artifactId,
    stage,
    subjectDigest: computeDiagramSubjectDigest(model),
    outputs: Object.fromEntries(outputsFor(model).map((path) => [path, fileDigest(model, path)])),
  };
}

export function validateDiagramReceipt(model: DiagramModel | null | undefined) {
  const text = model?.files?.["receipt.release.json"];
  if (typeof text !== "string") return false;
  try {
    const actual = JSON.parse(text) as unknown;
    const expected = createDiagramReceipt(model ?? {});
    const record = rec(actual);
    return Boolean(record) && record?.schema === expected.schema && record.plugin === expected.plugin &&
      record.artifactId === expected.artifactId && record.stage === expected.stage &&
      record.subjectDigest === expected.subjectDigest && JSON.stringify(record.outputs) === JSON.stringify(expected.outputs);
  } catch { return false; }
}

export function createDiagramReleaseManifest(model: DiagramModel) {
  const artifactId = model.artifactId ?? "diagram";
  const outputPaths = [`dist/${artifactId}.svg`, `dist/${artifactId}.png`, `dist/${artifactId}.html`];
  const project = rec(model.project);
  if (list(project?.outputs).includes("drawio")) outputPaths.push(`dist/${artifactId}.drawio`);
  return {
    schema: RELEASE_MANIFEST_SCHEMA,
    plugin: "diagram-production",
    artifactId,
    subjectDigest: computeDiagramSubjectDigest(model),
    outputs: outputPaths.map((path) => ({ path, sha256: fileDigest(model, path) })),
  };
}

function validNode(entry: unknown) {
  const node = rec(entry);
  return Boolean(node) && typeof node?.id === "string" && node.id.length > 0 && typeof node.label === "string" && node.label.length > 0;
}

function validEdge(entry: unknown, ids: Set<string>) {
  const edge = rec(entry);
  return Boolean(edge) && typeof edge?.from === "string" && typeof edge.to === "string" && ids.has(edge.from) && ids.has(edge.to);
}

function validateSource(source: JsonRecord | undefined, findings: ContractFinding[]) {
  if (!source) return;
  if (!DIAGRAM_TYPES.includes(source.type as DiagramType)) {
    findings.push(finding("DIAGRAM_TYPE_UNSUPPORTED", "src/diagram.json", `type must be one of: ${DIAGRAM_TYPES.join(", ")}`));
    return;
  }
  if (typeof source.title !== "string" || !source.title.trim()) findings.push(finding("DIAGRAM_SOURCE_INVALID", "src/diagram.json", "diagram title is required"));
  const nodes = list(source.nodes);
  const nodeDriven = !["bar", "line", "scatter", "radar", "quadrant", "gantt", "timeline", "venn", "pyramid"].includes(String(source.type));
  if (nodeDriven) {
    if (!nodes.length || !nodes.every(validNode)) findings.push(finding("DIAGRAM_SOURCE_INVALID", "src/diagram.json", "this diagram family requires nodes with unique id and label"));
    const ids = new Set(nodes.map((entry) => String(rec(entry)?.id ?? "")));
    if (ids.size !== nodes.length) findings.push(finding("DIAGRAM_SOURCE_INVALID", "src/diagram.json", "node ids must be unique"));
    if (!list(source.edges).every((entry) => validEdge(entry, ids))) findings.push(finding("DIAGRAM_SOURCE_INVALID", "src/diagram.json", "edges must reference declared nodes"));
  } else if (!list(source.data).length && !list(source.items).length && !nodes.length) {
    findings.push(finding("DIAGRAM_SOURCE_INVALID", "src/diagram.json", "this diagram family requires data, items, or nodes"));
  }
}

export function inspectDiagramSvg(value: FileContent | undefined) {
  const text = bytesOf(value).toString("utf8");
  const root = text.match(/<svg\b[^>]*>/iu)?.[0] ?? "";
  const viewBox = root.match(/\bviewBox=["']([^"']+)["']/iu)?.[1]?.trim().split(/\s+/u).map(Number) ?? [];
  const unsafe = hasUnsafeSvgReference(text);
  return { valid: /^<\?xml[^>]*>\s*<svg\b|^\s*<svg\b/iu.test(text), viewBox, unsafe, bytes: Buffer.byteLength(text) };
}

function validateEvidence(model: DiagramModel, path: string, schema: string, code: string, findings: ContractFinding[]) {
  const record = schemaRecord(model.files ?? {}, path, schema, code, findings);
  if (record && (record.artifactId !== model.artifactId || record.subjectDigest !== computeDiagramSubjectDigest(model) || record.verdict !== "pass")) findings.push(finding(code, path, "evidence must pass and bind the current artifact and subject digest"));
  return record;
}

export function validateDiagramModel(model: DiagramModel | null | undefined, options: { stage?: unknown } = {}) {
  const findings: ContractFinding[] = [];
  const stage = options.stage ?? "source";
  if (!STAGES.has(stage as DiagramStage)) return [finding("STAGE_INVALID", ".", "stage must be source, design, render, probe, review, or release")];
  const typedStage = stage as DiagramStage;
  const files = model?.files ?? {};
  for (const path of [".gitignore", "package.json", "package-lock.json", "plan.contract.json", "design.system.json", "diagram.project.json", "src/diagram.json"]) {
    if (!(path in files)) findings.push(finding("REQUIRED_PATH_MISSING", path, `${path} is required`));
  }
  const plan = schemaRecord(files, "plan.contract.json", PLAN_SCHEMA, "PLAN_INVALID", findings);
  if (plan && (plan.artifactId !== model?.artifactId || !STAGES.has(plan.targetStage as DiagramStage) || typeof plan.audience !== "string" || typeof plan.objective !== "string" || typeof plan.language !== "string")) findings.push(finding("PLAN_INVALID", "plan.contract.json", "plan must bind artifactId, targetStage, audience, objective, and language"));
  const design = schemaRecord(files, "design.system.json", DESIGN_SYSTEM_SCHEMA, "DESIGN_SYSTEM_INVALID", findings);
  const canvas = rec(design?.canvas); const typography = rec(design?.typography); const spacing = rec(design?.spacing);
  if (design && (!canvas || Number(canvas.width) < 320 || Number(canvas.height) < 240 || typeof canvas.background !== "string" || !typography || typeof typography.sans !== "string" || Number(typography.basePx) < 12 || !spacing || Number(spacing.gridPx) !== 4 || Number(spacing.nodeGapPx) <= 0 || Number(spacing.layerGapPx) <= 0)) findings.push(finding("DESIGN_SYSTEM_INVALID", "design.system.json", "design must declare a bounded canvas, typography, 4px grid, node gap, and layer gap"));
  const project = schemaRecord(files, "diagram.project.json", PROJECT_SCHEMA, "PROJECT_INVALID", findings);
  const projectOutputs = list(project?.outputs);
  if (project && (project.artifactId !== model?.artifactId || project.source !== "src/diagram.json" || project.designSystem !== "design.system.json" || !Array.isArray(project.outputs) || !["svg", "png", "html"].every((format) => projectOutputs.includes(format)) || projectOutputs.some((format) => !["svg", "png", "html", "drawio"].includes(String(format))))) findings.push(finding("PROJECT_INVALID", "diagram.project.json", "project must bind source/design paths and svg/png/html outputs; drawio is optional"));
  validateSource(schemaRecord(files, "src/diagram.json", SOURCE_SCHEMA, "DIAGRAM_SOURCE_INVALID", findings), findings);
  if ("plan.import-ledger.json" in files) {
    const ledger = schemaRecord(files, "plan.import-ledger.json", IMPORT_LEDGER_SCHEMA, "IMPORT_LEDGER_INVALID", findings);
    if (ledger && (typeof ledger.sourceFormat !== "string" || typeof ledger.sourceName !== "string" || ![ledger.preserved, ledger.approximations, ledger.losses].every((entries) => Array.isArray(entries) && entries.every((entry) => typeof entry === "string")))) findings.push(finding("IMPORT_LEDGER_INVALID", "plan.import-ledger.json", "import ledger must declare its source and string lists for preserved, approximated, and lost semantics"));
  }
  const ignore = files[".gitignore"];
  if (typeof ignore === "string" && ignore.split(/\r?\n/u).some((line) => /^(?:\/?dist\/|\*\.(?:svg|png|html|drawio))$/u.test(line.trim()))) findings.push(finding("DELIVERY_PATH_IGNORED", ".gitignore", "delivery outputs must not be ignored"));
  if (stageAtLeast(typedStage, "render")) {
    const artifactId = model?.artifactId ?? "diagram";
    const svgPath = `dist/${artifactId}.svg`; const svg = inspectDiagramSvg(files[svgPath]);
    if (!svg.valid || svg.unsafe || svg.viewBox.length !== 4) findings.push(finding("SVG_INVALID", svgPath, "SVG must be bounded, self-contained, and free of executable or external content"));
    const pngPath = `dist/${artifactId}.png`; if (!bytesOf(files[pngPath]).subarray(0, 8).equals(PNG_SIGNATURE)) findings.push(finding("PNG_INVALID", pngPath, "PNG output must have a valid signature"));
    const htmlPath = `dist/${artifactId}.html`; const html = bytesOf(files[htmlPath]).toString("utf8");
    if (!/^<!doctype html>/iu.test(html) || /(?:src|href)=["'](?:https?:|\/\/)/iu.test(html) || !html.includes("<svg")) findings.push(finding("HTML_INVALID", htmlPath, "HTML output must be self-contained and embed the SVG"));
    if (list(project?.outputs).includes("drawio")) { const path = `dist/${artifactId}.drawio`; if (!bytesOf(files[path]).toString("utf8").includes("<mxGraphModel")) findings.push(finding("DRAWIO_INVALID", path, "drawio output must contain an mxGraphModel")); }
    validateEvidence(model ?? {}, "evidence.render.json", RENDER_EVIDENCE_SCHEMA, "RENDER_EVIDENCE_INVALID", findings);
  }
  if (stageAtLeast(typedStage, "probe")) validateEvidence(model ?? {}, "evidence.probe.json", PROBE_EVIDENCE_SCHEMA, "PROBE_EVIDENCE_INVALID", findings);
  if (stageAtLeast(typedStage, "review")) validateEvidence(model ?? {}, "review.diagram.json", REVIEW_SCHEMA, "REVIEW_INVALID", findings);
  if (stageAtLeast(typedStage, "release")) {
    const release = schemaRecord(files, "release.manifest.json", RELEASE_MANIFEST_SCHEMA, "RELEASE_MANIFEST_INVALID", findings);
    const expected = createDiagramReleaseManifest(model ?? {});
    if (release && JSON.stringify(release) !== JSON.stringify(expected)) findings.push(finding("RELEASE_MANIFEST_INVALID", "release.manifest.json", "release manifest must bind current outputs"));
    if (!validateDiagramReceipt(model)) findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind current sources and generated outputs"));
  }
  if (files[".diagram-delivery-journal.json"]) findings.push(finding("MUTATION_JOURNAL_OPEN", ".diagram-delivery-journal.json", "a registered writer did not close its mutation journal"));
  return findings;
}

export function resolveWorkspaceRoot(cwd: string) {
  let cursor = resolve(cwd);
  while (dirname(cursor) !== cursor) {
    if (basename(dirname(cursor)) === "diagram" && basename(dirname(dirname(cursor))) === "artifacts") return dirname(dirname(dirname(cursor)));
    cursor = dirname(cursor);
  }
  return resolve(cwd);
}

export function isDiagramProjectRoot(root: string, workspaceRoot = resolveWorkspaceRoot(root)) {
  const expected = resolve(workspaceRoot, "artifacts", "diagram");
  return dirname(resolve(root)) === expected && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root));
}

async function collect(root: string, directory: string, files: FileMap, sizes: Record<string, number>, digests: DigestMap, limits: Required<{ maxFiles: number; maxBytesPerFile: number; maxTextBytes: number }>) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const path = join(directory, entry.name); const relativePath = relative(root, path).split(sep).join("/");
    const metadata = await lstat(path); if (metadata.isSymbolicLink()) throw new Error(`SYMLINK_DENIED:${relativePath}`);
    if (metadata.isDirectory()) { await collect(root, path, files, sizes, digests, limits); continue; }
    if (!metadata.isFile()) continue;
    if (Object.keys(files).length >= limits.maxFiles) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
    if (metadata.size > limits.maxBytesPerFile) throw new Error(`PROJECT_FILE_SIZE_EXCEEDED:${relativePath}`);
    const bytes = await readFile(path); sizes[relativePath] = bytes.byteLength; digests[relativePath] = digest(bytes);
    const text = TEXT_EXTENSIONS.has(extname(relativePath)) || relativePath === ".gitignore";
    if (text && bytes.byteLength > limits.maxTextBytes) throw new Error(`PROJECT_TEXT_SIZE_EXCEEDED:${relativePath}`);
    files[relativePath] = text ? bytes.toString("utf8") : bytes;
  }
}

export async function loadDiagramProject(rawRoot: string): Promise<DiagramModel> {
  const root = resolve(rawRoot); const workspaceRoot = resolveWorkspaceRoot(root);
  if (!isDiagramProjectRoot(root, workspaceRoot)) throw new Error("PROJECT_ROOT_OUT_OF_SCOPE");
  const files: FileMap = {}; const sizes: Record<string, number> = {}; const digests: DigestMap = {};
  await collect(root, root, files, sizes, digests, { maxFiles: 2048, maxBytesPerFile: 32 * 1024 * 1024, maxTextBytes: 4 * 1024 * 1024 });
  return { artifactId: basename(root), root, files, sizes, digests, plan: typeof files["plan.contract.json"] === "string" ? JSON.parse(files["plan.contract.json"]) : undefined, project: typeof files["diagram.project.json"] === "string" ? JSON.parse(files["diagram.project.json"]) : undefined };
}

export async function findDiagramProjects(cwd: string) {
  const base = resolve(resolveWorkspaceRoot(cwd), "artifacts", "diagram");
  try { return (await readdir(base, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name)).map((entry) => join(base, entry.name)).sort(); }
  catch { return []; }
}

export function evaluateDiagramWrite({ relativePath }: { relativePath?: string; toolName?: string; cwd?: string }) {
  const path = String(relativePath ?? "").replaceAll("\\", "/").replace(/^\.\//u, "");
  const marker = path.match(/(?:^|\/)artifacts\/diagram\/[^/]+\/(?<inner>.+)$/u);
  const inner = marker?.groups?.inner;
  if (inner && (GENERATED.test(inner) || inner === ".diagram-delivery-journal.json")) return { decision: "deny" as const, code: "PROTECTED_OUTPUT_WRITE", message: `${posix.normalize(inner)} is owned by registered diagram writers` };
  return { decision: "allow" as const };
}
