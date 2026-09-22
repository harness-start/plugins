import { createHash, type BinaryLike } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { TextDecoder } from "node:util";

import { DOMParser, type Element } from "@xmldom/xmldom";
import { unzipSync } from "fflate";
import { communicationAnchors, communicationCoreValid, communicationReviewValid } from "../../../lib/communication-contract.js";
import { estimateTextBox } from "./quality-signals.js";

export const PLAN_SCHEMA = "presentation-production/plan/v6";
export const STORYBOARD_SCHEMA = "presentation-production/storyboard/v6";
export const SKILL_COMPOSITION_SCHEMA =
  "presentation-production/skill-composition/v6";
export const DESIGN_SYSTEM_SCHEMA = "presentation-production/design-system/v6";
export const PROJECT_SCHEMA = "presentation-production/project/v6";
export const SLIDE_MANIFEST_SCHEMA =
  "presentation-production/slide-manifest/v6";
export const RENDER_EVIDENCE_SCHEMA =
  "presentation-production/render-evidence/v6";
export const STRUCTURE_EVIDENCE_SCHEMA =
  "presentation-production/structure-evidence/v6";
export const DESIGN_EVIDENCE_SCHEMA =
  "presentation-production/design-evidence/v6";
export const ACCESSIBILITY_EVIDENCE_SCHEMA =
  "presentation-production/accessibility-evidence/v6";
export const REVIEW_INPUT_SCHEMA = "presentation-production/review-input/v6";
export const REVIEW_SCHEMA = "presentation-production/review/v6";
export const RELEASE_MANIFEST_SCHEMA =
  "presentation-production/release-manifest/v6";
export const RECEIPT_SCHEMA = "presentation-production/receipt/v6";

export type PptxStage =
  "source" | "design" | "render" | "probe" | "review" | "release";
export type FileContent = string | Buffer | null;
export type FileMap = Record<string, FileContent>;
export type DigestMap = Record<string, string>;
export type JsonRecord = Record<string, unknown>;

export type ContractFinding = { code: string; path: string; message: string };
export type PptxModel = {
  artifactId?: string | undefined;
  root?: string | undefined;
  files?: FileMap | undefined;
  digests?: DigestMap | undefined;
  sizes?: Record<string, number> | undefined;
  plan?: unknown;
  project?: unknown;
  tracked?: unknown[];
  ignored?: unknown[];
};
export type PptxValidateOptions = { stage?: unknown };
export type PptxWriteOptions = {
  relativePath?: string;
  toolName?: string;
  writer?: string;
  cwd?: string;
};
export type PptxWriteDecision =
  { decision: "allow" } | { decision: "deny"; code: string; message: string };
export type PptxLoadLimits = {
  maxFiles?: number;
  maxBytesPerFile?: number;
  maxTextBytes?: number;
};
export type PptxReceipt = {
  schema: string;
  plugin: string;
  artifactId: string | undefined;
  stage: "release";
  subjectDigest: string;
  outputs: Record<string, string>;
};

const STAGES = new Set<PptxStage>([
  "source",
  "design",
  "render",
  "probe",
  "review",
  "release",
]);
const STAGE_RANK: Record<PptxStage, number> = {
  source: 0,
  design: 1,
  render: 2,
  probe: 3,
  review: 4,
  release: 5,
};
const SLIDE_SOURCE =
  /^(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.ts$/u;
const GENERATED_PATH =
  /^(?:dist\/|evidence\.[^/]+\.json$|review\.[^/]+\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$)/u;
const SLIDE_OWNER_VIOLATION =
  /(?:\baddSlide\s*\(|\bnew\s+pptxgen\b|from\s+["']pptxgenjs["']|\b(?:writeFile|writeFileSync|createWriteStream|fetch|setTimeout|setInterval)\s*\(|\b(?:Date\.now|Math\.random)\s*\(|from\s+["']node:(?:fs|child_process)["'])/u;

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
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const TEXT_BASENAMES = new Set([".gitignore", "LICENSE"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", ".cache", ".tmp"]);
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const SLIDE_WIDTH_IN = 13.333;
const SLIDE_HEIGHT_IN = 7.5;
const EMU_PER_INCH = 914400;
const DISPLAY_TITLE_MAX_WIDTH = 20;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const VISUAL_TYPES = new Set([
  "hero",
  "content",
  "comparison",
  "diagram",
  "data",
  "media",
  "closing",
]);
const HEADLINE_MODES = new Set(["label", "finding", "question"]);
const CONTENT_LOGICS = new Set([
  "statement",
  "group",
  "comparison",
  "evidence",
  "metric",
  "matrix",
]);
const DIAGRAM_LOGICS = new Set([
  "sequence",
  "branch",
  "cycle",
  "hierarchy",
  "network",
]);
const READING_DIRECTIONS = new Set([
  "left-to-right",
  "top-to-bottom",
  "clockwise",
  "radial",
]);
const GROUP_ENCODINGS = new Set([
  "bulleted",
  "numbered",
  "aligned-stack",
  "grid",
]);
const TYPOGRAPHY_ROLES = [
  "display",
  "title",
  "section",
  "body",
  "list",
  "caption",
  "numeric",
] as const;
const RELATION_KINDS = new Set([
  "flow",
  "dependency",
  "association",
  "disconnect",
]);
const REVIEW_CHECKS = [
  "audienceBoundary",
  "audienceCoverage",
  "headlineVoice",
  "typographyRhythm",
  "contentEncoding",
  "layoutRhythm",
  "relationshipSemantics",
  "groupingSemantics",
] as const;

const digest = (value: BinaryLike) =>
  createHash("sha256").update(value).digest("hex");
const isObject = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const rec = (value: unknown): JsonRecord | undefined =>
  isObject(value) ? value : undefined;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const bytesOf = (value: FileContent | undefined): Buffer =>
  Buffer.isBuffer(value)
    ? value
    : Buffer.from(typeof value === "string" ? value : "");
const finding = (
  code: string,
  path: string,
  message: string,
): ContractFinding => ({ code, path, message });
const stageAtLeast = (stage: PptxStage, expected: PptxStage) =>
  STAGE_RANK[stage] >= STAGE_RANK[expected];

function displayWidth(value: string) {
  let width = 0;
  for (const character of value) {
    width += /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}]/u.test(character) ? 2 : 1;
  }
  return width;
}

function validDisplayTitle(value: unknown) {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    !/[\r\n]/u.test(value) &&
    displayWidth(value) <= DISPLAY_TITLE_MAX_WIDTH
  );
}

function parseJson(
  files: FileMap,
  filePath: string,
  findings?: ContractFinding[],
): unknown {
  const value = files[filePath];
  if (typeof value !== "string") {
    findings?.push(
      finding(
        "REQUIRED_PATH_MISSING",
        filePath,
        `${filePath} is required and must be UTF-8 JSON`,
      ),
    );
    return null;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    findings?.push(
      finding("JSON_INVALID", filePath, `${filePath} must contain valid JSON`),
    );
    return null;
  }
}

function schemaRecord(
  files: FileMap,
  filePath: string,
  schema: string,
  code: string,
  findings: ContractFinding[],
) {
  const value = parseJson(files, filePath, findings);
  const record = rec(value);
  if (value !== null && (!record || record.schema !== schema))
    findings.push(
      finding(code, filePath, `${filePath} must use schema ${schema}`),
    );
  return record;
}

function sourceDigestRecord(model: PptxModel, record: JsonRecord | undefined) {
  return (
    Boolean(record) &&
    record?.artifactId === model.artifactId &&
    record?.subjectDigest === computePptxSubjectDigest(model)
  );
}

function isGeneratedSubjectPath(filePath: string): boolean {
  return (
    filePath === ".pptx-delivery-journal.json" ||
    GENERATED_PATH.test(filePath) ||
    (filePath.startsWith("src/slides/") && filePath.endsWith(".png"))
  );
}

function fileDigest(
  model: PptxModel | null | undefined,
  filePath: string,
): string {
  return (
    model?.digests?.[filePath] ?? digest(bytesOf(model?.files?.[filePath]))
  );
}

export function computePptxSubjectDigest(
  model: PptxModel | null | undefined,
): string {
  const records = Object.keys(model?.files ?? {})
    .filter((filePath) => !isGeneratedSubjectPath(filePath))
    .sort()
    .map((filePath) => `${filePath}\0${fileDigest(model, filePath)}\n`)
    .join("");
  return digest(records);
}

function releaseOutputPaths(model: PptxModel | null | undefined): string[] {
  return Object.keys(model?.files ?? {})
    .filter(
      (filePath) =>
        GENERATED_PATH.test(filePath) ||
        (filePath.startsWith("src/slides/") && filePath.endsWith(".png")),
    )
    .filter((filePath) => filePath !== "receipt.release.json")
    .sort();
}

export function createPptxReceipt(
  model: PptxModel,
  stage = "release",
): PptxReceipt {
  if (stage !== "release")
    throw new Error(`unsupported PPTX receipt stage: ${stage}`);
  return {
    schema: RECEIPT_SCHEMA,
    plugin: "presentation-production",
    artifactId: model.artifactId,
    stage,
    subjectDigest: computePptxSubjectDigest(model),
    outputs: Object.fromEntries(
      releaseOutputPaths(model).map((filePath) => [
        filePath,
        fileDigest(model, filePath),
      ]),
    ),
  };
}

export function validatePptxReceipt(
  model: PptxModel | null | undefined,
  stage = "release",
): boolean {
  if (stage !== "release") return false;
  const text = model?.files?.[`receipt.${stage}.json`];
  if (typeof text !== "string") return false;
  let receipt: unknown;
  try {
    receipt = JSON.parse(text) as unknown;
  } catch {
    return false;
  }
  const expected = createPptxReceipt(model ?? {}, stage);
  const record = rec(receipt);
  return (
    Boolean(record) &&
    record?.schema === expected.schema &&
    record.plugin === expected.plugin &&
    record.artifactId === expected.artifactId &&
    record.stage === expected.stage &&
    record.subjectDigest === expected.subjectDigest &&
    JSON.stringify(record.outputs) === JSON.stringify(expected.outputs)
  );
}

function validateRequiredSource(files: FileMap, findings: ContractFinding[]) {
  for (const filePath of [
    ".gitignore",
    "package.json",
    "package-lock.json",
    "plan.contract.json",
    "plan.storyboard.json",
    "plan.skill-composition.json",
    "design.system.json",
    "pptx.project.json",
    "src/deck.ts",
    "src/semantic-layout.ts",
    "src/text-layout.ts",
    "src/theme.ts",
    "tsconfig.json",
    "src/slides/manifest.json",
  ])
    if (!(filePath in files))
      findings.push(
        finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`),
      );
}

function validateGitignore(files: FileMap, findings: ContractFinding[]) {
  const text = files[".gitignore"];
  if (typeof text !== "string") return;
  text.split(/\r?\n/u).forEach((raw, offset) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) return;
    const normalized = line.replace(/^\//u, "");
    if (
      /^(?:dist|build|evidence)(?:\/|$)/u.test(normalized) ||
      /^(?:receipt|review|release)(?:\.|\/|$)/u.test(normalized) ||
      /^(?:\*\*\/)?\*\.(?:png|svg|pdf|pptx)$/u.test(normalized)
    ) {
      findings.push(
        finding(
          "DELIVERY_PATH_IGNORED",
          `.gitignore:${offset + 1}`,
          `artifact delivery path must not be ignored: ${line}`,
        ),
      );
    }
  });
}

function validateDesignSystem(
  record: JsonRecord | undefined,
  findings: ContractFinding[],
) {
  const colors = rec(record?.colors);
  const roles = rec(colors?.roles);
  const typography = rec(record?.typography);
  const typeRoles = rec(typography?.roles);
  const spacing = rec(record?.spacing);
  const requiredColors = [
    "canvas",
    "surface",
    "textPrimary",
    "textSecondary",
    "accent",
    "success",
    "warning",
    "error",
  ];
  if (
    !roles ||
    !requiredColors.every(
      (key) =>
        typeof roles[key] === "string" &&
        /^[A-Fa-f0-9]{6}$/u.test(String(roles[key])),
    )
  )
    findings.push(
      finding(
        "DESIGN_SYSTEM_INVALID",
        "design.system.json",
        "semantic color roles must be six-digit sRGB hex values without #",
      ),
    );
  if (
    !typeRoles ||
    !TYPOGRAPHY_ROLES.every(
      (key) => {
        const role = rec(typeRoles[key]);
        return (
          role &&
          typeof role.fontFamily === "string" &&
          role.fontFamily.trim().length > 0 &&
          Number(role.fontSizePt) > 0 &&
          Number(role.lineSpacingMultiple) >= 1 &&
          Number(role.lineSpacingMultiple) <= 2 &&
          Number.isFinite(role.charSpacingPt) &&
          Number(role.charSpacingPt) >= -1 &&
          Number(role.charSpacingPt) <= 10 &&
          Number.isInteger(role.maxLines) &&
          Number(role.maxLines) > 0 &&
          ["cjk", "latin", "mixed"].includes(String(role.scriptPolicy)) &&
          Number.isFinite(role.paragraphSpaceAfterPt) &&
          Number(role.paragraphSpaceAfterPt) >= 0 &&
          ["left", "center", "right"].includes(String(role.horizontalAlign)) &&
          ["top", "middle", "bottom"].includes(String(role.verticalAlign)) &&
          Number.isFinite(role.marginPt) &&
          Number(role.marginPt) >= 0 &&
          (!["body", "list"].includes(key) ||
            (role.horizontalAlign === "left" && role.verticalAlign === "top"))
        );
      },
    )
  )
    findings.push(
      finding(
        "DESIGN_SYSTEM_INVALID",
        "design.system.json",
        "typography roles must declare family, point size, line and paragraph spacing, alignment, margin, line limit, and script policy; body and list roles are left/top aligned",
      ),
    );
  if (
    !spacing ||
    Number(spacing.pageMarginIn) < 0.3 ||
    Number(spacing.baseUnitIn) <= 0 ||
    Number(spacing.blockGapIn) <= 0 ||
    Object.hasOwn(spacing, "paragraphGapIn")
  )
    findings.push(
      finding(
        "DESIGN_SYSTEM_INVALID",
        "design.system.json",
        "spacing must declare pageMarginIn >= 0.3 and positive baseUnitIn and blockGapIn; paragraph spacing belongs to typography roles",
      ),
    );
}

function validAudience(value: unknown) {
  const audience = rec(value);
  if (
    !audience ||
    !["primary", "context", "desiredAction"].every(
      (key) =>
        typeof audience[key] === "string" &&
        Boolean(String(audience[key]).trim()),
    ) ||
    !["implicit", "explicit"].includes(String(audience.addressing))
  )
    return false;
  return (
    audience.addressing !== "explicit" ||
    (typeof audience.explicitRationale === "string" &&
      Boolean(audience.explicitRationale.trim()))
  );
}

function validHeadline(value: unknown) {
  const headline = rec(value);
  if (!headline || !HEADLINE_MODES.has(String(headline.mode))) return false;
  return (
    headline.mode !== "finding" ||
    (typeof headline.evidenceAnchor === "string" &&
      Boolean(headline.evidenceAnchor.trim()))
  );
}

function labeledEntries(value: unknown, minimum = 2) {
  const entries = list(value).map(rec);
  const ids = new Set<string>();
  return (
    entries.length >= minimum &&
    entries.every((entry) => {
      const id = String(entry?.id ?? "");
      const valid =
        Boolean(entry) &&
        ID.test(id) &&
        !ids.has(id) &&
        typeof entry?.label === "string" &&
        Boolean(entry.label.trim());
      ids.add(id);
      return valid;
    })
  );
}

function completeCoordinateSet(
  entries: unknown,
  leftKey: string,
  rightKey: string,
  leftIds: ReadonlySet<string>,
  rightIds: ReadonlySet<string>,
  validEntry: (entry: JsonRecord) => boolean,
) {
  const coordinates = new Set<string>();
  const cells = list(entries).map(rec);
  return (
    cells.length === leftIds.size * rightIds.size &&
    cells.every((cell) => {
      if (!cell) return false;
      const left = String(cell[leftKey] ?? "");
      const right = String(cell[rightKey] ?? "");
      const coordinate = `${left}\0${right}`;
      const valid =
        leftIds.has(left) &&
        rightIds.has(right) &&
        !coordinates.has(coordinate) &&
        validEntry(cell);
      coordinates.add(coordinate);
      return valid;
    })
  );
}

function validateMatrixVisual(
  visual: JsonRecord,
  path: string,
  findings: ContractFinding[],
) {
  const matrix = rec(visual.matrix);
  const rows = list(matrix?.rows).map(rec);
  const columns = list(matrix?.columns).map(rec);
  const rowIds = new Set(rows.map((entry) => String(entry?.id ?? "")));
  const columnIds = new Set(columns.map((entry) => String(entry?.id ?? "")));
  const valid =
    visual.type === "comparison" &&
    matrix &&
    ID.test(String(matrix.id ?? "")) &&
    matrix.coverage === "full" &&
    labeledEntries(matrix.rows) &&
    labeledEntries(matrix.columns) &&
    completeCoordinateSet(
      matrix.cells,
      "rowId",
      "columnId",
      rowIds,
      columnIds,
      (cell) =>
        ["supported", "unsupported", "conditional"].includes(
          String(cell.status),
        ) &&
        typeof cell.label === "string" &&
        Boolean(cell.label.trim()),
    );
  if (!valid)
    findings.push(
      finding(
        "STORYBOARD_MATRIX_INVALID",
        path,
        "matrix visuals require labeled row and column dimensions plus one typed cell for every coordinate",
      ),
    );
}

function validateComparisonVisual(
  visual: JsonRecord,
  path: string,
  findings: ContractFinding[],
) {
  const comparison = rec(visual.comparison);
  const options = list(comparison?.options).map(rec);
  const criteria = list(comparison?.criteria).map(rec);
  const optionIds = new Set(options.map((entry) => String(entry?.id ?? "")));
  const criterionIds = new Set(
    criteria.map((entry) => String(entry?.id ?? "")),
  );
  const valid =
    visual.type === "comparison" &&
    comparison &&
    ID.test(String(comparison.id ?? "")) &&
    labeledEntries(comparison.options) &&
    labeledEntries(comparison.criteria, 1) &&
    criteria.every(
      (criterion) =>
        typeof criterion?.basis === "string" &&
        Boolean(criterion.basis.trim()),
    ) &&
    completeCoordinateSet(
      comparison.cells,
      "optionId",
      "criterionId",
      optionIds,
      criterionIds,
      (cell) =>
        typeof cell.value === "string" && Boolean(cell.value.trim()),
    );
  if (!valid)
    findings.push(
      finding(
        "STORYBOARD_COMPARISON_INVALID",
        path,
        "comparison visuals require shared evidence-based criteria and one value for every option and criterion",
      ),
    );
}

function validateMetricVisual(
  visual: JsonRecord,
  path: string,
  findings: ContractFinding[],
) {
  const ids = new Set<string>();
  const metrics = list(visual.metrics).map(rec);
  const valid =
    visual.type === "data" &&
    metrics.length > 0 &&
    metrics.every((metric) => {
      const id = String(metric?.id ?? "");
      const entryValid =
        Boolean(metric) &&
        ID.test(id) &&
        !ids.has(id) &&
        typeof metric?.label === "string" &&
        Boolean(metric.label.trim()) &&
        typeof metric.value === "number" &&
        Number.isFinite(metric.value) &&
        (metric.unit === undefined ||
          (typeof metric.unit === "string" && Boolean(metric.unit.trim()))) &&
        typeof metric.evidenceAnchor === "string" &&
        Boolean(metric.evidenceAnchor.trim());
      ids.add(id);
      return entryValid;
    });
  if (!valid)
    findings.push(
      finding(
        "STORYBOARD_METRIC_INVALID",
        path,
        "metric visuals require at least one finite numeric value with a label and evidence anchor",
      ),
    );
}

function graphValid(
  logic: string,
  nodeIds: Set<string>,
  relations: Array<JsonRecord | undefined>,
) {
  const directed = relations.filter(
    (relation): relation is JsonRecord =>
      Boolean(relation) && relation?.kind !== "disconnect",
  );
  const outgoing = new Map([...nodeIds].map((id) => [id, [] as string[]]));
  const incoming = new Map([...nodeIds].map((id) => [id, [] as string[]]));
  const undirected = new Map([...nodeIds].map((id) => [id, new Set<string>()]));
  for (const relation of directed) {
    const from = String(relation.from);
    const to = String(relation.to);
    outgoing.get(from)?.push(to);
    incoming.get(to)?.push(from);
    undirected.get(from)?.add(to);
    undirected.get(to)?.add(from);
  }
  const first = nodeIds.values().next().value as string | undefined;
  const seen = new Set<string>();
  const pending = first ? [first] : [];
  while (pending.length) {
    const current = pending.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const next of undirected.get(current) ?? []) pending.push(next);
  }
  const connected = seen.size === nodeIds.size;
  const indegrees = new Map(
    [...nodeIds].map((id) => [id, incoming.get(id)?.length ?? 0]),
  );
  const queue = [...nodeIds].filter((id) => indegrees.get(id) === 0);
  let visited = 0;
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    visited += 1;
    for (const next of outgoing.get(current) ?? []) {
      const degree = (indegrees.get(next) ?? 0) - 1;
      indegrees.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }
  const dag = visited === nodeIds.size;
  const roots = [...nodeIds].filter((id) => (incoming.get(id)?.length ?? 0) === 0);
  const leaves = [...nodeIds].filter((id) => (outgoing.get(id)?.length ?? 0) === 0);
  if (logic === "sequence")
    return (
      connected &&
      dag &&
      roots.length === 1 &&
      leaves.length === 1 &&
      [...nodeIds].every(
        (id) =>
          (incoming.get(id)?.length ?? 0) <= 1 &&
          (outgoing.get(id)?.length ?? 0) <= 1,
      )
    );
  if (logic === "branch")
    return (
      connected &&
      dag &&
      [...nodeIds].some(
        (id) =>
          (incoming.get(id)?.length ?? 0) > 1 ||
          (outgoing.get(id)?.length ?? 0) > 1,
      )
    );
  if (logic === "hierarchy") return connected && dag && roots.length === 1;
  if (logic === "cycle")
    return (
      connected &&
      !dag &&
      relations.some((relation) => relation?.pathRole === "return")
    );
  return logic === "network" && connected;
}

function validateSlideVisual(
  files: FileMap,
  slide: JsonRecord | undefined,
  index: number,
  findings: ContractFinding[],
) {
  const visual = rec(slide?.visual);
  const path = `plan.storyboard.json#slides/${index}/visual`;
  const logic = String(visual?.logic ?? "");
  if (
    !visual ||
    !VISUAL_TYPES.has(String(visual.type)) ||
    !(visual.type === "diagram"
      ? DIAGRAM_LOGICS.has(logic)
      : CONTENT_LOGICS.has(logic)) ||
    (visual.variant !== undefined &&
      (typeof visual.variant !== "string" || !visual.variant.trim()))
  ) {
    findings.push(
      finding(
        "STORYBOARD_VISUAL_INVALID",
        path,
        "visual must use a supported type, compatible information logic, and an optional non-empty variant",
      ),
    );
    return;
  }
  const groups = list(visual.groups).map(rec);
  const groupIds = new Set<string>();
  const groupsValid = groups.every((group) => {
    const id = String(group?.id ?? "");
    const valid =
      Boolean(group) &&
      ID.test(id) &&
      !groupIds.has(id) &&
      GROUP_ENCODINGS.has(String(group?.encoding)) &&
      Number.isInteger(group?.itemCount) &&
      Number(group?.itemCount) >= 2;
    groupIds.add(id);
    return valid;
  });
  if (!groupsValid || (logic === "group" && !groups.length))
    findings.push(
      finding(
        "STORYBOARD_GROUP_INVALID",
        path,
        "group visuals require unique groups with a supported encoding and at least two items",
      ),
    );
  if (logic === "matrix") validateMatrixVisual(visual, path, findings);
  if (logic === "comparison")
    validateComparisonVisual(visual, path, findings);
  if (logic === "metric") validateMetricVisual(visual, path, findings);
  if (visual.type !== "diagram") return;
  if (
    !READING_DIRECTIONS.has(String(visual.readingDirection)) ||
    (["sequence", "branch"].includes(logic) &&
      visual.readingDirection !== "left-to-right") ||
    (logic === "hierarchy" &&
      !["left-to-right", "top-to-bottom"].includes(
        String(visual.readingDirection),
      )) ||
    (logic === "cycle" && visual.readingDirection !== "clockwise") ||
    (logic === "network" &&
      !["left-to-right", "radial"].includes(String(visual.readingDirection))) ||
    Object.hasOwn(visual, "directionRationale")
  )
    findings.push(
      finding(
        "NATIVE_DIAGRAM_INVALID",
        path,
        "sequence and branch diagrams must read left-to-right on 16:9; only hierarchy may read top-to-bottom",
      ),
    );
  if (visual.mode === "svg") {
    const assetPath =
      typeof visual.asset === "string" ? visual.asset : path;
    if (
      typeof visual.asset !== "string" ||
      !/^assets\/diagrams\/[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/u.test(
        visual.asset,
      ) ||
      !/^[a-f0-9]{64}$/u.test(String(visual.sha256 ?? "")) ||
      !["contain", "cover"].includes(String(visual.fit)) ||
      typeof visual.takeaway !== "string" ||
      !visual.takeaway.trim() ||
      typeof visual.alt !== "string" ||
      !visual.alt.trim()
    ) {
      findings.push(
        finding(
          "DIAGRAM_ASSET_INVALID",
          assetPath,
          "SVG diagram slides require a local asset, SHA-256, fit, takeaway, and alt text",
        ),
      );
      return;
    }
    const asset = files[visual.asset];
    if (
      typeof asset !== "string" ||
      digest(Buffer.from(asset)) !== visual.sha256
    ) {
      findings.push(
        finding(
          "DIAGRAM_ASSET_INVALID",
          visual.asset,
          "diagram SVG must exist and match the declared SHA-256",
        ),
      );
      return;
    }
    if (
      !/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/iu.test(asset) ||
      hasUnsafeSvgReference(asset)
    )
      findings.push(
        finding(
          "DIAGRAM_ASSET_UNSAFE",
          visual.asset,
          "diagram SVG must be self-contained and contain no executable or external content",
        ),
      );
    return;
  }
  if (visual.mode !== "native") {
    findings.push(
      finding(
        "DIAGRAM_MODE_INVALID",
        path,
        "diagram visuals must declare svg or native mode",
      ),
    );
    return;
  }
  const nodes = list(visual.nodes).map(rec);
  const relations = list(visual.relations).map(rec);
  const nodeIds = new Set<string>();
  const nodesValid =
    nodes.length >= 2 &&
    nodes.every((node) => {
      const id = String(node?.id ?? "");
      const valid =
        Boolean(node) &&
        ID.test(id) &&
        !nodeIds.has(id) &&
        typeof node?.role === "string" &&
        Boolean(node.role.trim()) &&
        TYPOGRAPHY_ROLES.includes(
          String(node?.typographyRole) as (typeof TYPOGRAPHY_ROLES)[number],
        );
      nodeIds.add(id);
      return valid;
    });
  const relationIds = new Set<string>();
  const relationsValid =
    relations.length > 0 &&
    relations.every((relation) => {
      const id = String(relation?.id ?? "");
      const kind = String(relation?.kind ?? "");
      const segmentCount = relation?.segmentCount ?? 1;
      const valid =
        Boolean(relation) &&
        ID.test(id) &&
        !relationIds.has(id) &&
        nodeIds.has(String(relation?.from ?? "")) &&
        nodeIds.has(String(relation?.to ?? "")) &&
        relation?.from !== relation?.to &&
        RELATION_KINDS.has(kind) &&
        ["forward", "return"].includes(String(relation?.pathRole)) &&
        (kind === "disconnect" ||
          (Number.isInteger(segmentCount) &&
            Number(segmentCount) >= 1 &&
            Number(segmentCount) <= 8));
      relationIds.add(id);
      return valid;
    });
  if (!nodesValid || !relationsValid || !graphValid(logic, nodeIds, relations))
    findings.push(
      finding(
        "NATIVE_DIAGRAM_INVALID",
        path,
        "native diagrams require unique nodes, typed node-bound relations, and graph topology matching the declared visual logic",
      ),
    );
}

function validateSourceSchemas(
  model: PptxModel,
  files: FileMap,
  findings: ContractFinding[],
) {
  const plan = schemaRecord(
    files,
    "plan.contract.json",
    PLAN_SCHEMA,
    "PLAN_INVALID",
    findings,
  );
  if (
    plan &&
    (plan.artifactId !== model.artifactId ||
      !STAGES.has(plan.targetStage as PptxStage) ||
      !validAudience(plan.audience) ||
      typeof plan.objective !== "string" ||
      typeof plan.language !== "string")
  )
    findings.push(
      finding(
        "PLAN_INVALID",
        "plan.contract.json",
        "plan must bind artifactId, targetStage, structured audience intent, objective, and language",
      ),
    );
  const storyboard = schemaRecord(
    files,
    "plan.storyboard.json",
    STORYBOARD_SCHEMA,
    "STORYBOARD_INVALID",
    findings,
  );
  const storyboardSlides = list(storyboard?.slides);
  if (!communicationCoreValid(plan?.communicationCore)) findings.push(finding("COMMUNICATION_CORE_INVALID", "plan.contract.json", "presentation plan must bind a complete communicationCore"));
  else {
    const allowed = new Set(storyboardSlides.map((entry) => `slide:${String(rec(entry)?.id ?? "")}`));
    if (communicationAnchors(plan?.communicationCore).some((anchor) => !allowed.has(anchor))) findings.push(finding("COMMUNICATION_CUE_UNBOUND", "plan.contract.json", "every presentation signature cue anchor must reference a storyboard slide"));
  }
  if (
    storyboard &&
    (!storyboardSlides.length ||
      !storyboardSlides.every(
        (entry, index) =>
          rec(entry)?.index === index + 1 &&
          typeof rec(entry)?.id === "string" &&
          validDisplayTitle(rec(entry)?.displayTitle) &&
          validHeadline(rec(entry)?.headline) &&
          typeof rec(entry)?.role === "string" &&
          isObject(rec(entry)?.visual) &&
          typeof rec(entry)?.assertion === "string" && Boolean(String(rec(entry)?.assertion).trim()) &&
          typeof rec(entry)?.narrativeJob === "string" && Boolean(String(rec(entry)?.narrativeJob).trim()) &&
          typeof rec(entry)?.transition === "string" && Boolean(String(rec(entry)?.transition).trim()),
      ))
  )
    findings.push(
      finding(
        "STORYBOARD_INVALID",
        "plan.storyboard.json",
        "storyboard slides must be contiguous and declare id, compact displayTitle, headline mode, role, and visual",
      ),
    );
  for (const [index, entry] of storyboardSlides.entries()) {
    const slide = rec(entry);
    if (slide && !validDisplayTitle(slide.displayTitle))
      findings.push(
        finding(
          "DISPLAY_TITLE_INVALID",
          `plan.storyboard.json#slides/${index}/displayTitle`,
          `displayTitle must be one line and at most ${DISPLAY_TITLE_MAX_WIDTH} display-width units`,
        ),
      );
    validateSlideVisual(files, slide, index, findings);
  }
  if (storyboard && storyboardSlides.some((entry) => typeof rec(entry)?.coreContribution !== "string" || !String(rec(entry)?.coreContribution).trim())) findings.push(finding("STORYBOARD_COMMUNICATION_INVALID", "plan.storyboard.json", "every slide must state how it contributes to the communication core"));
  const composition = schemaRecord(
    files,
    "plan.skill-composition.json",
    SKILL_COMPOSITION_SCHEMA,
    "SKILL_COMPOSITION_INVALID",
    findings,
  );
  if (
    composition &&
    (!Array.isArray(composition.workers) ||
      !composition.workers.every((entry) => {
        const worker = rec(entry);
        return (
          worker &&
          !Object.hasOwn(worker, "revision") &&
          typeof worker.name === "string" &&
          ["used", "skipped", "unavailable"].includes(String(worker.status))
        );
      }))
  )
    findings.push(
      finding(
        "SKILL_COMPOSITION_INVALID",
        "plan.skill-composition.json",
        "workers must declare name and used/skipped/unavailable status",
      ),
    );
  const design = schemaRecord(
    files,
    "design.system.json",
    DESIGN_SYSTEM_SCHEMA,
    "DESIGN_SYSTEM_INVALID",
    findings,
  );
  if (design) validateDesignSystem(design, findings);
  const project = schemaRecord(
    files,
    "pptx.project.json",
    PROJECT_SCHEMA,
    "PROJECT_INVALID",
    findings,
  );
  if (
    project &&
    (project.artifactId !== model.artifactId ||
      project.layout !== "LAYOUT_16X9" ||
      project.entry !== "src/deck.ts" ||
      project.slideManifest !== "src/slides/manifest.json" ||
      project.designSystem !== "design.system.json")
  )
    findings.push(
      finding(
        "PROJECT_INVALID",
        "pptx.project.json",
        "project must bind artifactId and the fixed editable 16:9 source contract",
      ),
    );
  return { storyboardSlides };
}

function validateSlideSource(
  files: FileMap,
  entry: unknown,
  findings: ContractFinding[],
) {
  const item = rec(entry);
  const sourceName = item?.source;
  const sourceMatch =
    typeof sourceName === "string" ? sourceName.match(SLIDE_SOURCE) : null;
  const sourcePath =
    typeof sourceName === "string"
      ? posix.join("src/slides", sourceName)
      : "src/slides/manifest.json";
  if (!sourceMatch) {
    findings.push(
      finding(
        "SLIDE_NAME_INVALID",
        sourcePath,
        "slide source must use NNN-slug.ts",
      ),
    );
    return;
  }
  if (Number(sourceMatch.groups?.index) !== item?.index)
    findings.push(
      finding(
        "SLIDE_INDEX_MISMATCH",
        sourcePath,
        "filename index must match manifest index",
      ),
    );
  const source = files[sourcePath];
  if (typeof source !== "string") {
    findings.push(
      finding(
        "SLIDE_SOURCE_MISSING",
        sourcePath,
        "manifest slide source is missing",
      ),
    );
    return;
  }
  if (SLIDE_OWNER_VIOLATION.test(source))
    findings.push(
      finding(
        "SLIDE_OWNER_VIOLATION",
        sourcePath,
        "slide module may only modify the provided slide context",
      ),
    );
  if (
    (source.match(/export\s+(?:async\s+)?function\s+renderSlide\s*\(/gu) ?? [])
      .length !== 1
  )
    findings.push(
      finding(
        "SLIDE_EXPORT_INVALID",
        sourcePath,
        "slide module must export exactly one renderSlide function",
      ),
    );
  if (/from\s+["']\.\/[0-9]{3}-[^"']+["']/u.test(source))
    findings.push(
      finding(
        "CROSS_SLIDE_IMPORT",
        sourcePath,
        "slide modules may not import sibling slides",
      ),
    );
}

function validateManifest(
  files: FileMap,
  storyboardSlides: unknown[],
  findings: ContractFinding[],
) {
  const manifest = schemaRecord(
    files,
    "src/slides/manifest.json",
    SLIDE_MANIFEST_SCHEMA,
    "MANIFEST_INVALID",
    findings,
  );
  const slides = list(manifest?.slides);
  if (manifest && !slides.length)
    findings.push(
      finding(
        "MANIFEST_INVALID",
        "src/slides/manifest.json",
        "manifest slides must be a non-empty array",
      ),
    );
  const ids = new Set<unknown>();
  slides.forEach((entry, index) => {
    const item = rec(entry);
    if (
      item?.index !== index + 1 ||
      typeof item.id !== "string" ||
      ids.has(item.id) ||
      !validDisplayTitle(item.displayTitle) ||
      typeof item.role !== "string" ||
      !isObject(item.visual) ||
      !isObject(item.accessibility)
    )
      findings.push(
        finding(
          "SLIDE_SEQUENCE_INVALID",
          "src/slides/manifest.json",
          "slide indexes and ids must be unique, contiguous, and include compact displayTitle, role, visual, and accessibility",
        ),
      );
    ids.add(item?.id);
    validateSlideSource(files, entry, findings);
  });
  if (
    storyboardSlides.length &&
    (storyboardSlides.length !== slides.length ||
      storyboardSlides.some(
        (entry, index) => {
          const planned = rec(entry);
          const actual = rec(slides[index]);
          const plannedVisual = rec(planned?.visual);
          const actualVisual = rec(actual?.visual);
          return (
            planned?.id !== actual?.id ||
            planned?.displayTitle !== actual?.displayTitle ||
            plannedVisual?.type !== actualVisual?.type ||
            plannedVisual?.logic !== actualVisual?.logic ||
            plannedVisual?.variant !== actualVisual?.variant ||
            plannedVisual?.mode !== actualVisual?.mode ||
            plannedVisual?.readingDirection !== actualVisual?.readingDirection
          );
        },
      ))
  )
    findings.push(
      finding(
        "STORYBOARD_MANIFEST_MISMATCH",
        "src/slides/manifest.json",
        "manifest must preserve storyboard page count, ids, display titles, and visual declarations",
      ),
    );
  return slides;
}

function xmlRelationships(xml: string) {
  const relationships: Array<{
    id: string;
    target: string;
    type: string;
    external: boolean;
  }> = [];
  const document = new DOMParser({
    onError: (level, message) => {
      if (level === "fatalError" || level === "error")
        throw new Error(`PPTX_XML_INVALID:${message}`);
    },
  }).parseFromString(xml, "application/xml");
  for (const element of Array.from(
    document.getElementsByTagName("Relationship"),
  )) {
    relationships.push({
      id: element.getAttribute("Id") ?? "",
      target: element.getAttribute("Target") ?? "",
      type: element.getAttribute("Type") ?? "",
      external: element.getAttribute("TargetMode") === "External",
    });
  }
  return relationships;
}

export type PptxPackageInspection = {
  slideCount: number;
  requiredParts: string[];
  externalRelationships: string[];
  unresolvedRelationships: string[];
  media: Array<{ path: string; sha256: string }>;
  slides: Array<{
    index: number;
    objects: PptxObjectInspection[];
    layoutFingerprint: string[];
    bodyObjectCount: number;
  }>;
};

export type PptxObjectInspection = {
  name: string;
  kind: string;
  text?: string;
  lineBreaks?: number;
  bounds: { x: number; y: number; w: number; h: number };
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  beginArrow?: string;
  endArrow?: string;
  lineWidthIn?: number;
  fontSizePt?: number;
  fontFace?: string;
  charSpacingPt?: number;
  lineSpacingMultiple?: number;
  paragraphSpaceAfterPt?: number;
  horizontalAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  marginPt?: number;
  bulletKind?: "bullet" | "numbered";
  autofit?: "shrink" | "resize";
  paragraphs?: Array<{
    fontSizePt?: number;
    fontFace?: string;
    charSpacingPt?: number;
    lineSpacingMultiple?: number;
    paragraphSpaceAfterPt?: number;
    horizontalAlign?: "left" | "center" | "right";
    bulletKind?: "bullet" | "numbered";
  }>;
};

function numberAttribute(
  element: Element | null | undefined,
  name: string,
) {
  return Number(element?.getAttribute(name) ?? 0);
}

function firstDescendant(element: Element, name: string) {
  return element.getElementsByTagName(name).item(0) as Element | null;
}

function paragraphInspection(paragraph: Element) {
  const properties = firstDescendant(paragraph, "a:pPr");
  const spacing = properties
    ? firstDescendant(properties, "a:spcPct")
    : null;
  const afterContainer = properties ? firstDescendant(properties, "a:spcAft") : null;
  const after = afterContainer ? firstDescendant(afterContainer, "a:spcPts") : null;
  const runProperties =
    firstDescendant(paragraph, "a:rPr") ??
    firstDescendant(paragraph, "a:defRPr");
  const alignment = properties?.getAttribute("algn");
  const latin = runProperties ? firstDescendant(runProperties, "a:latin") : null;
  const bulletKind: "bullet" | "numbered" | undefined = firstDescendant(paragraph, "a:buAutoNum")
    ? "numbered"
    : firstDescendant(paragraph, "a:buChar")
      ? "bullet"
      : undefined;
  return {
    ...(runProperties?.hasAttribute("sz")
      ? { fontSizePt: numberAttribute(runProperties, "sz") / 100 }
      : {}),
    ...(latin?.hasAttribute("typeface")
      ? { fontFace: latin.getAttribute("typeface") ?? "" }
      : {}),
    ...(runProperties?.hasAttribute("spc")
      ? { charSpacingPt: numberAttribute(runProperties, "spc") / 100 }
      : {}),
    ...(spacing?.hasAttribute("val")
      ? { lineSpacingMultiple: numberAttribute(spacing, "val") / 100000 }
      : {}),
    ...(after?.hasAttribute("val")
      ? { paragraphSpaceAfterPt: numberAttribute(after, "val") / 100 }
      : {}),
    ...(["l", "ctr", "r"].includes(String(alignment))
      ? {
          horizontalAlign: ({ l: "left", ctr: "center", r: "right" } as const)[
            alignment as "l" | "ctr" | "r"
          ],
        }
      : {}),
    ...(bulletKind ? { bulletKind } : {}),
  };
}

function relationLineKind(kind: string) {
  return /^(?:line|connector|straightConnector[0-9]+|bentConnector[0-9]+|curvedConnector[0-9]+)$/iu.test(
    kind,
  );
}

function inspectSlideXml(xml: string, index: number) {
  const document = new DOMParser({
    onError: (level, message) => {
      if (level === "fatalError" || level === "error")
        throw new Error(`PPTX_XML_INVALID:${message}`);
    },
  }).parseFromString(xml, "application/xml");
  const allObjects: PptxObjectInspection[] = [];
  const append = (element: Element, fallbackKind: string) => {
    const nonVisual = firstDescendant(element, "p:cNvPr");
    const name = nonVisual?.getAttribute("name") ?? "";
    if (!name) return;
    const transform = firstDescendant(element, "a:xfrm");
    const offset = transform
      ? firstDescendant(transform, "a:off")
      : null;
    const extent = transform
      ? firstDescendant(transform, "a:ext")
      : null;
    const x = numberAttribute(offset, "x") / EMU_PER_INCH;
    const y = numberAttribute(offset, "y") / EMU_PER_INCH;
    const w = numberAttribute(extent, "cx") / EMU_PER_INCH;
    const h = numberAttribute(extent, "cy") / EMU_PER_INCH;
    const geometry = firstDescendant(element, "a:prstGeom");
    const kind = geometry?.getAttribute("prst") || fallbackKind;
    const texts = Array.from(element.getElementsByTagName("a:t"));
    const text = texts.map((entry) => entry.textContent ?? "").join("");
    const paragraphs = element.getElementsByTagName("a:p").length;
    const paragraphDetails = Array.from(
      element.getElementsByTagName("a:p"),
    ).map(paragraphInspection);
    const firstParagraph = paragraphDetails[0];
    const bodyProperties = firstDescendant(element, "a:bodyPr");
    const vertical = bodyProperties?.getAttribute("anchor");
    const autofit = bodyProperties
      ? firstDescendant(bodyProperties, "a:normAutofit")
        ? "shrink"
        : firstDescendant(bodyProperties, "a:spAutoFit")
          ? "resize"
          : undefined
      : undefined;
    const lineBreaks =
      element.getElementsByTagName("a:br").length + Math.max(0, paragraphs - 1);
    const line = firstDescendant(element, "a:ln");
    const beginArrow = firstDescendant(element, "a:headEnd")?.getAttribute(
      "type",
    );
    const endArrow = firstDescendant(element, "a:tailEnd")?.getAttribute(
      "type",
    );
    const flipH = transform?.getAttribute("flipH") === "1";
    const flipV = transform?.getAttribute("flipV") === "1";
    const start =
      relationLineKind(kind)
        ? { x: flipH ? x + w : x, y: flipV ? y + h : y }
        : undefined;
    const end =
      relationLineKind(kind)
        ? { x: flipH ? x : x + w, y: flipV ? y : y + h }
        : undefined;
    allObjects.push({
      name,
      kind,
      ...(text ? { text } : {}),
      ...(text ? { lineBreaks } : {}),
      bounds: { x, y, w, h },
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      ...(beginArrow ? { beginArrow } : {}),
      ...(endArrow ? { endArrow } : {}),
      ...(line?.hasAttribute("w")
        ? {
            lineWidthIn:
              numberAttribute(line, "w") / EMU_PER_INCH,
          }
        : {}),
      ...(firstParagraph?.fontSizePt !== undefined
        ? { fontSizePt: firstParagraph.fontSizePt }
        : {}),
      ...(firstParagraph?.fontFace
        ? { fontFace: firstParagraph.fontFace }
        : {}),
      ...(firstParagraph?.charSpacingPt !== undefined
        ? { charSpacingPt: firstParagraph.charSpacingPt }
        : {}),
      ...(firstParagraph?.lineSpacingMultiple !== undefined
        ? { lineSpacingMultiple: firstParagraph.lineSpacingMultiple }
        : {}),
      ...(firstParagraph?.paragraphSpaceAfterPt !== undefined
        ? { paragraphSpaceAfterPt: firstParagraph.paragraphSpaceAfterPt }
        : {}),
      ...(firstParagraph?.horizontalAlign
        ? { horizontalAlign: firstParagraph.horizontalAlign }
        : {}),
      ...(["t", "ctr", "b"].includes(String(vertical))
        ? {
            verticalAlign: ({ t: "top", ctr: "middle", b: "bottom" } as const)[
              vertical as "t" | "ctr" | "b"
            ],
          }
        : {}),
      ...(bodyProperties?.hasAttribute("lIns")
        ? { marginPt: numberAttribute(bodyProperties, "lIns") / 12700 }
        : {}),
      ...(firstParagraph?.bulletKind
        ? { bulletKind: firstParagraph.bulletKind }
        : {}),
      ...(autofit ? { autofit } : {}),
      ...(paragraphDetails.length ? { paragraphs: paragraphDetails } : {}),
    });
  };
  for (const element of Array.from(document.getElementsByTagName("p:sp")))
    append(element, "shape");
  for (const element of Array.from(document.getElementsByTagName("p:cxnSp")))
    append(element, "connector");
  for (const element of Array.from(document.getElementsByTagName("p:pic")))
    append(element, "picture");
  const body = allObjects.filter(({ name, bounds }) => {
    const centerY = bounds.y + bounds.h / 2;
    return (
      !name.startsWith("pptx:title:") &&
      !name.startsWith("pptx:chrome:") &&
      centerY >= SLIDE_HEIGHT_IN * 0.15 &&
      centerY <= SLIDE_HEIGHT_IN * 0.9
    );
  });
  const layoutFingerprint = body
    .map(({ kind, bounds }) => {
      const x = Math.max(
        0,
        Math.min(11, Math.floor(((bounds.x + bounds.w / 2) / SLIDE_WIDTH_IN) * 12)),
      );
      const y = Math.max(
        0,
        Math.min(6, Math.floor(((bounds.y + bounds.h / 2) / SLIDE_HEIGHT_IN) * 7)),
      );
      const w = Math.max(1, Math.min(12, Math.round((bounds.w / SLIDE_WIDTH_IN) * 12)));
      const h = Math.max(1, Math.min(7, Math.round((bounds.h / SLIDE_HEIGHT_IN) * 7)));
      return `${kind}:${x}:${y}:${w}:${h}`;
    })
    .sort();
  return {
    index,
    objects: allObjects,
    layoutFingerprint,
    bodyObjectCount: body.length,
  };
}

export function inspectPptxPackage(bytes: Buffer): PptxPackageInspection {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Error("PPTX_ZIP_SIGNATURE_INVALID");
  let total = 0;
  const entries = unzipSync(bytes, {
    filter(file) {
      if (file.name.startsWith("/") || file.name.split("/").includes(".."))
        throw new Error("PPTX_ZIP_PATH_INVALID");
      total += file.originalSize;
      if (total > 256 * 1024 * 1024 || file.originalSize > 64 * 1024 * 1024)
        throw new Error("PPTX_ZIP_LIMIT_EXCEEDED");
      return true;
    },
  });
  const names = new Set(Object.keys(entries));
  const requiredParts = [
    "[Content_Types].xml",
    "_rels/.rels",
    "ppt/presentation.xml",
    "ppt/_rels/presentation.xml.rels",
  ];
  if (!requiredParts.every((name) => names.has(name)))
    throw new Error("PPTX_REQUIRED_PART_MISSING");
  const decode = (name: string) => UTF8.decode(entries[name]);
  const externalRelationships: string[] = [];
  const unresolvedRelationships: string[] = [];
  for (const name of [...names].filter((entry) => entry.endsWith(".rels"))) {
    const source =
      name === "_rels/.rels"
        ? ""
        : name.replace(/_rels\/([^/]+)\.rels$/u, "$1");
    for (const relationship of xmlRelationships(decode(name))) {
      if (relationship.external) {
        externalRelationships.push(`${name}:${relationship.target}`);
        continue;
      }
      const target = posix.normalize(
        posix.join(posix.dirname(source), relationship.target),
      );
      if (!names.has(target))
        unresolvedRelationships.push(`${name}:${relationship.id}:${target}`);
    }
  }
  const slides = [...names]
    .filter((name) => /^ppt\/slides\/slide[0-9]+\.xml$/u.test(name))
    .sort(
      (a, b) =>
        Number(a.match(/[0-9]+/u)?.[0]) - Number(b.match(/[0-9]+/u)?.[0]),
    );
  if (!slides.length) throw new Error("PPTX_SLIDES_MISSING");
  for (const slide of slides) {
    const rels = `ppt/slides/_rels/${basename(slide)}.rels`;
    if (
      !names.has(rels) ||
      !xmlRelationships(decode(rels)).some(
        (entry) => entry.type.endsWith("/slideLayout") && !entry.external,
      )
    )
      throw new Error(`PPTX_SLIDE_LAYOUT_MISSING:${slide}`);
  }
  return {
    slideCount: slides.length,
    requiredParts,
    externalRelationships: externalRelationships.sort(),
    unresolvedRelationships: unresolvedRelationships.sort(),
    media: [...names]
      .filter((name) => /^ppt\/media\/[^/]+$/u.test(name))
      .sort()
      .map((path) => ({ path, sha256: digest(entries[path] ?? new Uint8Array()) })),
    slides: slides.map((path, index) =>
      inspectSlideXml(decode(path), index + 1),
    ),
  };
}

export function inspectPng(bytes: Buffer) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE))
    throw new Error("PNG_SIGNATURE_INVALID");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width <= 0 || height <= 0) throw new Error("PNG_DIMENSIONS_INVALID");
  return { width, height };
}

type Point = { x: number; y: number };
type Bounds = { x: number; y: number; w: number; h: number };

function pointDistance(left: Point, right: Point) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function boundaryDistance(point: Point, bounds: Bounds) {
  const right = bounds.x + bounds.w;
  const bottom = bounds.y + bounds.h;
  if (
    point.x >= bounds.x &&
    point.x <= right &&
    point.y >= bounds.y &&
    point.y <= bottom
  )
    return Math.min(
      point.x - bounds.x,
      right - point.x,
      point.y - bounds.y,
      bottom - point.y,
    );
  const dx = Math.max(bounds.x - point.x, 0, point.x - right);
  const dy = Math.max(bounds.y - point.y, 0, point.y - bottom);
  return Math.hypot(dx, dy);
}

function pointInside(point: Point, bounds: Bounds) {
  return (
    point.x > bounds.x &&
    point.x < bounds.x + bounds.w &&
    point.y > bounds.y &&
    point.y < bounds.y + bounds.h
  );
}

function segmentIntersectsBounds(start: Point, end: Point, bounds: Bounds) {
  if (pointInside(start, bounds) || pointInside(end, bounds)) return true;
  const edges: Array<[Point, Point]> = [
    [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y },
    ],
    [
      { x: bounds.x + bounds.w, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
    ],
    [
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      { x: bounds.x, y: bounds.y + bounds.h },
    ],
    [
      { x: bounds.x, y: bounds.y + bounds.h },
      { x: bounds.x, y: bounds.y },
    ],
  ];
  const orientation = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return edges.some(([left, right]) => {
    if (
      Math.max(start.x, end.x) < Math.min(left.x, right.x) ||
      Math.max(left.x, right.x) < Math.min(start.x, end.x) ||
      Math.max(start.y, end.y) < Math.min(left.y, right.y) ||
      Math.max(left.y, right.y) < Math.min(start.y, end.y)
    )
      return false;
    const first = orientation(start, end, left);
    const second = orientation(start, end, right);
    const third = orientation(left, right, start);
    const fourth = orientation(left, right, end);
    return first * second <= 0 && third * fourth <= 0;
  });
}

function arrowPresent(value: string | undefined) {
  return Boolean(value && value !== "none");
}

function semanticTypographyRole(name: string) {
  const parts = name.split(":");
  if (parts[0] !== "pptx") return undefined;
  const role =
    parts[1] === "node" || parts[1] === "metric"
      ? parts[4]
      : parts[1] === "matrix" || parts[1] === "comparison"
        ? parts[6]
        : ["title", "text", "list", "item"].includes(parts[1] ?? "")
          ? parts[3]
          : undefined;
  return TYPOGRAPHY_ROLES.includes(
    role as (typeof TYPOGRAPHY_ROLES)[number],
  )
    ? role
    : undefined;
}

function closeEnough(left: number | undefined, right: unknown, tolerance: number) {
  return (
    left !== undefined &&
    Number.isFinite(Number(right)) &&
    Math.abs(left - Number(right)) <= tolerance
  );
}

function spacingMatches(left: number | undefined, right: unknown) {
  return Number(right) === 0 && left === undefined
    ? true
    : closeEnough(left, right, 0.1);
}

function validateRenderedText(
  inspected: PptxPackageInspection["slides"][number],
  slide: JsonRecord,
  designRoles: JsonRecord,
  baseUnitIn: number,
  findings: ContractFinding[],
  pptxPath: string,
) {
  const slideId = String(slide.id ?? "");
  const path = `${pptxPath}#slide=${inspected.index}`;
  for (const object of inspected.objects.filter(({ text }) => Boolean(text))) {
    if (object.name.startsWith("pptx:chrome:")) continue;
    const roleName = semanticTypographyRole(object.name);
    const role = roleName ? rec(designRoles[roleName]) : undefined;
    const paragraphs = object.paragraphs ?? [];
    const rhythmValid =
      Boolean(role) &&
      !object.autofit &&
      object.lineBreaks !== undefined &&
      object.lineBreaks + 1 <= Number(role?.maxLines) &&
      object.verticalAlign === role?.verticalAlign &&
      closeEnough(object.marginPt, role?.marginPt, 0.1) &&
      paragraphs.length > 0 &&
      paragraphs.every(
        (paragraph) =>
          closeEnough(paragraph.fontSizePt, role?.fontSizePt, 0.1) &&
          paragraph.fontFace === role?.fontFamily &&
          spacingMatches(paragraph.charSpacingPt, role?.charSpacingPt) &&
          closeEnough(
            paragraph.lineSpacingMultiple,
            role?.lineSpacingMultiple,
            0.01,
          ) &&
          spacingMatches(
            paragraph.paragraphSpaceAfterPt,
            role?.paragraphSpaceAfterPt,
          ) &&
          paragraph.horizontalAlign === role?.horizontalAlign,
      );
    if (!rhythmValid)
      findings.push(
        finding(
          "PPTX_TEXT_RHYTHM_INVALID",
          path,
          `text object ${object.name} must use a semantic typography role and match its emitted OOXML rhythm without autofit`,
        ),
      );
    if (role && object.text) {
      const estimate = estimateTextBox({
        text: object.text,
        widthIn: object.bounds.w,
        fontSizePt: Number(role.fontSizePt),
        lineSpacingMultiple: Number(role.lineSpacingMultiple),
        marginPt: Number(role.marginPt),
        paragraphSpaceAfterPt: Number(role.paragraphSpaceAfterPt),
        paragraphCount: object.paragraphs?.length ?? 1,
        explicitLines: Number(object.lineBreaks ?? 0) + 1,
      });
      if (
        estimate.estimatedLines > Number(role.maxLines) ||
        estimate.requiredHeightIn > object.bounds.h * 1.15
      )
        findings.push(
          finding(
            "PPTX_TEXT_FIT_INVALID",
            path,
            `text object ${object.name} is estimated to require ${estimate.estimatedLines} lines and ${estimate.requiredHeightIn.toFixed(2)}in of height`,
          ),
        );
    }
  }
  const visual = rec(slide.visual);
  for (const rawGroup of list(visual?.groups)) {
    const group = rec(rawGroup);
    if (!group) continue;
    const id = String(group.id ?? "");
    const itemCount = Number(group.itemCount);
    const encoding = String(group.encoding ?? "");
    if (["bulleted", "numbered"].includes(encoding)) {
      const name = `pptx:list:${slideId}:list:${id}`;
      const matches = inspected.objects.filter((object) => object.name === name);
      const expectedBullet = encoding === "bulleted" ? "bullet" : "numbered";
      if (
        matches.length !== 1 ||
        matches[0]?.paragraphs?.length !== itemCount ||
        matches[0]?.paragraphs?.some(
          (paragraph) => paragraph.bulletKind !== expectedBullet,
        )
      )
        findings.push(
          finding(
            "PPTX_GROUP_ENCODING_INVALID",
            path,
            `group ${id} must render ${itemCount} real ${encoding} paragraphs`,
          ),
        );
      continue;
    }
    const prefix = `pptx:item:${slideId}:`;
    const suffix = new RegExp(`:${id}:[0-9]+$`, "u");
    const items = inspected.objects
      .filter(
        ({ name }) => name.startsWith(prefix) && suffix.test(name),
      )
      .sort(
        (left, right) =>
          Number(left.name.split(":").at(-1)) -
          Number(right.name.split(":").at(-1)),
      );
    let geometryValid = items.length === itemCount;
    const tolerance = Math.max(0.04, baseUnitIn / 2);
    if (geometryValid && encoding === "aligned-stack") {
      const firstX = items[0]?.bounds.x ?? 0;
      const gaps = items.slice(1).map(
        (item, offset) => item.bounds.y - (items[offset]?.bounds.y ?? 0),
      );
      geometryValid =
        items.every((item) => Math.abs(item.bounds.x - firstX) <= tolerance) &&
        gaps.every(
          (gap) => Math.abs(gap - (gaps[0] ?? gap)) <= tolerance,
        );
    }
    if (geometryValid && encoding === "grid")
      geometryValid = items.every((item, index) =>
        items.some(
          (peer, peerIndex) =>
            peerIndex !== index &&
            (Math.abs(peer.bounds.x - item.bounds.x) <= tolerance ||
              Math.abs(peer.bounds.y - item.bounds.y) <= tolerance) &&
            Math.abs(peer.bounds.w - item.bounds.w) <= tolerance &&
            Math.abs(peer.bounds.h - item.bounds.h) <= tolerance,
        ),
      );
    if (!geometryValid)
      findings.push(
        finding(
          "PPTX_GROUP_ENCODING_INVALID",
          path,
          `group ${id} must render the declared ${encoding} item count and alignment`,
        ),
      );
  }
}

function validateStructuredVisualOutput(
  inspected: PptxPackageInspection["slides"][number],
  slide: JsonRecord,
  findings: ContractFinding[],
  pptxPath: string,
) {
  const visual = rec(slide.visual);
  const slideId = String(slide.id ?? "");
  const path = `${pptxPath}#slide=${inspected.index}`;
  const visibleTextMatches = (actual: string | undefined, expected: unknown) =>
    actual?.replace(/\s+/gu, " ").trim() ===
    String(expected ?? "").replace(/\s+/gu, " ").trim();
  if (visual?.logic === "matrix") {
    const matrix = rec(visual.matrix);
    const matrixId = String(matrix?.id ?? "");
    for (const rawCell of list(matrix?.cells)) {
      const cell = rec(rawCell);
      const name = `pptx:matrix:${slideId}:${matrixId}:${String(cell?.rowId ?? "")}:${String(cell?.columnId ?? "")}:body`;
      const matches = inspected.objects.filter((object) => object.name === name);
      if (
        matches.length !== 1 ||
        !visibleTextMatches(matches[0]?.text, cell?.label)
      )
        findings.push(
          finding(
            "PPTX_MATRIX_INVALID",
            path,
            `matrix cell ${name} must map to exactly one visible object`,
          ),
        );
    }
  }
  if (visual?.logic === "comparison") {
    const comparison = rec(visual.comparison);
    const comparisonId = String(comparison?.id ?? "");
    for (const rawCell of list(comparison?.cells)) {
      const cell = rec(rawCell);
      const name = `pptx:comparison:${slideId}:${comparisonId}:${String(cell?.optionId ?? "")}:${String(cell?.criterionId ?? "")}:body`;
      const matches = inspected.objects.filter((object) => object.name === name);
      if (
        matches.length !== 1 ||
        !visibleTextMatches(matches[0]?.text, cell?.value)
      )
        findings.push(
          finding(
            "PPTX_COMPARISON_INVALID",
            path,
            `comparison cell ${name} must map to exactly one visible object`,
          ),
        );
    }
  }
  if (visual?.logic === "metric") {
    for (const rawMetric of list(visual.metrics)) {
      const metric = rec(rawMetric);
      const name = `pptx:metric:${slideId}:${String(metric?.id ?? "")}:numeric`;
      const matches = inspected.objects.filter((object) => object.name === name);
      if (
        matches.length !== 1 ||
        !matches[0]?.text?.includes(String(metric?.value ?? ""))
      )
        findings.push(
          finding(
            "PPTX_METRIC_INVALID",
            path,
            `metric ${name} must render its declared numeric value`,
          ),
        );
    }
  }
}

function validateRelationshipObjects(
  inspected: PptxPackageInspection["slides"][number],
  slide: JsonRecord,
  findings: ContractFinding[],
  pptxPath: string,
) {
  const visual = rec(slide.visual);
  const slideId = String(slide.id ?? "");
  const path = `${pptxPath}#slide=${inspected.index}`;
  const declaredRelations = new Set(
    visual?.type === "diagram" && visual.mode === "native"
      ? list(visual.relations).map((entry) => String(rec(entry)?.id ?? ""))
      : [],
  );
  for (const object of inspected.objects) {
    if (
      object.name.startsWith("pptx:title:") ||
      object.name.startsWith("pptx:chrome:")
    )
      continue;
    const centerY = object.bounds.y + object.bounds.h / 2;
    if (centerY < SLIDE_HEIGHT_IN * 0.15 || centerY > SLIDE_HEIGHT_IN * 0.9)
      continue;
    const isLine = relationLineKind(object.kind);
    const isArrowShape = /arrow|chevron/iu.test(object.kind);
    const hasArrow =
      arrowPresent(object.beginArrow) || arrowPresent(object.endArrow);
    if (!isLine && !isArrowShape && !hasArrow) continue;
    if (object.name.startsWith(`pptx:separator:${slideId}:`)) {
      if (isLine && !hasArrow) continue;
    } else if (object.name.startsWith(`pptx:edge:${slideId}:`) && isLine) {
      const relationId = object.name.split(":")[3] ?? "";
      if (declaredRelations.has(relationId)) continue;
    }
    findings.push(
      finding(
        "PPTX_UNDECLARED_RELATION",
        path,
        `body relationship object ${object.name} must be a declared native diagram edge or an arrowless semantic separator`,
      ),
    );
  }
}

function validateRenderedSemantics(
  inspection: PptxPackageInspection,
  storyboardSlides: unknown[],
  designSystem: JsonRecord | undefined,
  findings: ContractFinding[],
  pptxPath: string,
) {
  const designRoles = rec(rec(designSystem?.typography)?.roles) ?? {};
  const baseUnitIn = Number(rec(designSystem?.spacing)?.baseUnitIn ?? 0.1);
  for (const [offset, raw] of storyboardSlides.entries()) {
    const slide = rec(raw);
    const inspected = inspection.slides[offset];
    if (!slide || !inspected) continue;
    const slideId = String(slide.id ?? "");
    const titlePrefix = `pptx:title:${slideId}:`;
    const titles = inspected.objects.filter(({ name }) =>
      name.startsWith(titlePrefix),
    );
    const actualTitle = titles[0]?.text?.replace(/\s+/gu, " ").trim();
    if (
      titles.length !== 1 ||
      titles[0]?.lineBreaks !== 0 ||
      actualTitle !== String(slide.displayTitle ?? "").replace(/\s+/gu, " ").trim()
    )
      findings.push(
        finding(
          "PPTX_TITLE_MISMATCH",
          `${pptxPath}#slide=${offset + 1}`,
          "each slide must contain exactly one named title whose text matches displayTitle",
        ),
      );
    validateRenderedText(
      inspected,
      slide,
      designRoles,
      baseUnitIn,
      findings,
      pptxPath,
    );
    validateStructuredVisualOutput(
      inspected,
      slide,
      findings,
      pptxPath,
    );
    validateRelationshipObjects(
      inspected,
      slide,
      findings,
      pptxPath,
    );
    const visual = rec(slide.visual);
    if (visual?.type !== "diagram" || visual.mode !== "native") continue;
    const nodeSpecs = list(visual.nodes).map(rec);
    const nodes = new Map<string, PptxObjectInspection>();
    for (const spec of nodeSpecs) {
      const id = String(spec?.id ?? "");
      const name = `pptx:node:${slideId}:${id}:${String(spec?.typographyRole ?? "")}`;
      const matches = inspected.objects.filter((object) => object.name === name);
      if (matches.length === 1 && matches[0]) nodes.set(id, matches[0]);
      else
        findings.push(
          finding(
            "PPTX_RELATION_GEOMETRY_INVALID",
            `${pptxPath}#slide=${offset + 1}`,
            `native diagram node ${id} must map to exactly one named shape`,
          ),
        );
    }
    for (const relation of list(visual.relations).map(rec)) {
      const relationId = String(relation?.id ?? "");
      const kind = String(relation?.kind ?? "");
      const source = nodes.get(String(relation?.from ?? ""));
      const target = nodes.get(String(relation?.to ?? ""));
      if (!source || !target) continue;
      const edgePrefix = `pptx:edge:${slideId}:${relationId}:`;
      const edges = inspected.objects
        .filter(({ name }) => name.startsWith(edgePrefix))
        .sort(
          (left, right) =>
            Number(left.name.slice(edgePrefix.length)) -
            Number(right.name.slice(edgePrefix.length)),
        );
      if (kind === "disconnect") {
        const markerName = `pptx:marker:${slideId}:${relationId}`;
        const markers = inspected.objects.filter(
          ({ name }) => name === markerName,
        );
        const marker = markers[0];
        const markerCenter = marker
          ? {
              x: marker.bounds.x + marker.bounds.w / 2,
              y: marker.bounds.y + marker.bounds.h / 2,
            }
          : undefined;
        const sourceCenter = {
          x: source.bounds.x + source.bounds.w / 2,
          y: source.bounds.y + source.bounds.h / 2,
        };
        const targetCenter = {
          x: target.bounds.x + target.bounds.w / 2,
          y: target.bounds.y + target.bounds.h / 2,
        };
        const span = pointDistance(sourceCenter, targetCenter);
        const routeDistance = markerCenter
          ? pointDistance(sourceCenter, markerCenter) +
            pointDistance(markerCenter, targetCenter)
          : Number.POSITIVE_INFINITY;
        if (
          edges.length ||
          markers.length !== 1 ||
          !markerCenter ||
          pointInside(markerCenter, source.bounds) ||
          pointInside(markerCenter, target.bounds) ||
          routeDistance > span + 0.12
        )
          findings.push(
            finding(
              "PPTX_RELATION_GEOMETRY_INVALID",
              `${pptxPath}#slide=${offset + 1}&relation=${relationId}`,
              "disconnect relations require one between-node marker and no connector line",
            ),
          );
        continue;
      }
      const expectedSegments = Number(relation?.segmentCount ?? 1);
      if (
        edges.length !== expectedSegments ||
        edges.some(
          (edge, index) => edge.name !== `${edgePrefix}${index}` || !edge.start || !edge.end,
        )
      ) {
        findings.push(
          finding(
            "PPTX_RELATION_GEOMETRY_INVALID",
            `${pptxPath}#slide=${offset + 1}&relation=${relationId}`,
            "relation line segments must be complete, contiguous, and zero-indexed",
          ),
        );
        continue;
      }
      const first = edges[0];
      const last = edges.at(-1);
      if (!first?.start || !last?.end) continue;
      const tolerance = Math.max(
        0.08,
        ...edges.map(({ lineWidthIn = 0 }) => lineWidthIn / 2),
      );
      let geometryInvalid =
        boundaryDistance(first.start, source.bounds) > tolerance ||
        boundaryDistance(last.end, target.bounds) > tolerance;
      for (let index = 1; index < edges.length; index += 1) {
        const previous = edges[index - 1];
        const current = edges[index];
        if (
          !previous?.end ||
          !current?.start ||
          pointDistance(previous.end, current.start) > tolerance
        )
          geometryInvalid = true;
      }
      const related = new Set([String(relation?.from), String(relation?.to)]);
      for (const edge of edges) {
        if (!edge.start || !edge.end) continue;
        for (const [nodeId, node] of nodes) {
          if (
            !related.has(nodeId) &&
            segmentIntersectsBounds(edge.start, edge.end, node.bounds)
          )
            geometryInvalid = true;
        }
      }
      if (geometryInvalid)
        findings.push(
          finding(
            "PPTX_RELATION_GEOMETRY_INVALID",
            `${pptxPath}#slide=${offset + 1}&relation=${relationId}`,
            "relation endpoints must touch declared nodes, segments must join, and routes must avoid unrelated nodes",
          ),
        );
      const sourceCenter = {
        x: source.bounds.x + source.bounds.w / 2,
        y: source.bounds.y + source.bounds.h / 2,
      };
      const targetCenter = {
        x: target.bounds.x + target.bounds.w / 2,
        y: target.bounds.y + target.bounds.h / 2,
      };
      const readingDirection = String(visual.readingDirection ?? "");
      if (
        relation?.pathRole === "forward" &&
        ((readingDirection === "left-to-right" &&
          targetCenter.x <= sourceCenter.x + tolerance) ||
          (readingDirection === "top-to-bottom" &&
            targetCenter.y <= sourceCenter.y + tolerance))
      )
        findings.push(
          finding(
            "PPTX_READING_DIRECTION_INVALID",
            `${pptxPath}#slide=${offset + 1}&relation=${relationId}`,
            "forward relations must progress in the declared physical reading direction",
          ),
        );
      const styleInvalid =
        kind === "association"
          ? edges.some(
              ({ beginArrow, endArrow }) =>
                arrowPresent(beginArrow) || arrowPresent(endArrow),
            )
          : edges.some(
              ({ beginArrow, endArrow }, index) =>
                arrowPresent(beginArrow) ||
                (index === edges.length - 1
                  ? !arrowPresent(endArrow)
                  : arrowPresent(endArrow)),
            );
      if (styleInvalid)
        findings.push(
          finding(
            "PPTX_RELATION_STYLE_INVALID",
            `${pptxPath}#slide=${offset + 1}&relation=${relationId}`,
            "flow and dependency arrows belong only at the target; associations have no arrows",
          ),
        );
    }
  }
}

function validateRendered(
  model: PptxModel,
  slides: unknown[],
  storyboardSlides: unknown[],
  findings: ContractFinding[],
) {
  const files = model.files ?? {};
  const pptxPath = `dist/${model.artifactId}.pptx`;
  const pdfPath = `dist/${model.artifactId}.pdf`;
  try {
    const inspection = inspectPptxPackage(bytesOf(files[pptxPath]));
    if (
      inspection.slideCount !== slides.length ||
      inspection.unresolvedRelationships.length
    )
      findings.push(
        finding(
          "PPTX_STRUCTURE_INVALID",
          pptxPath,
          "PPTX slide count and internal relationships must match the manifest",
        ),
      );
    validateRenderedSemantics(
      inspection,
      storyboardSlides,
      rec(parseJson(files, "design.system.json")),
      findings,
      pptxPath,
    );
    const expectedDiagramDigests = storyboardSlides
      .map((entry) => rec(rec(entry)?.visual)?.sha256)
      .filter((value): value is string => typeof value === "string");
    if (
      expectedDiagramDigests.length &&
      (inspection.externalRelationships.length > 0 ||
        expectedDiagramDigests.some(
          (expected) => !inspection.media.some(({ sha256 }) => sha256 === expected),
        ))
    ) findings.push(
      finding(
        "DIAGRAM_MEDIA_MISMATCH",
        pptxPath,
        "every diagram slide must embed the current SVG bytes and use no external package relationship",
      ),
    );
  } catch (error) {
    findings.push(
      finding(
        "PPTX_INVALID",
        pptxPath,
        error instanceof Error ? error.message : String(error),
      ),
    );
  }
  const pdf = bytesOf(files[pdfPath]);
  if (pdf.length < 5 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-")
    findings.push(
      finding(
        "PDF_INVALID",
        pdfPath,
        "PDF must have a valid PDF signature and originate from the final PPTX",
      ),
    );
  const pagePaths = Object.keys(files)
    .filter((name) => /^dist\/pages\/[0-9]{3}\.png$/u.test(name))
    .sort();
  if (
    pagePaths.length !== slides.length ||
    pagePaths.some(
      (name, index) =>
        name !== `dist/pages/${String(index + 1).padStart(3, "0")}.png`,
    )
  )
    findings.push(
      finding(
        "PAGE_MAPPING_INVALID",
        "dist/pages",
        "page PNGs must be contiguous and one-to-one with manifest slides",
      ),
    );
  for (const pagePath of pagePaths)
    try {
      inspectPng(bytesOf(files[pagePath]));
    } catch {
      findings.push(
        finding("PNG_INVALID", pagePath, "rendered page must be a valid PNG"),
      );
    }
  for (const entry of slides) {
    const item = rec(entry);
    const source =
      typeof item?.source === "string" ? `src/slides/${item.source}` : "";
    const preview = source
      ? `${source.slice(0, -3)}.${fileDigest(model, source)}.png`
      : "";
    if (!preview || !(preview in files))
      findings.push(
        finding(
          "PREVIEW_MISSING",
          preview || "src/slides",
          "current source-hash preview is required after render",
        ),
      );
    else
      try {
        inspectPng(bytesOf(files[preview]));
      } catch {
        findings.push(
          finding("PNG_INVALID", preview, "slide preview must be a valid PNG"),
        );
      }
  }
  const render = schemaRecord(
    files,
    "evidence.render.json",
    RENDER_EVIDENCE_SCHEMA,
    "RENDER_EVIDENCE_INVALID",
    findings,
  );
  if (
    render &&
    (!sourceDigestRecord(model, render) ||
      rec(render.output)?.pptxSha256 !== model.digests?.[pptxPath] ||
      rec(render.output)?.pdfSha256 !== model.digests?.[pdfPath] ||
      render.pageCount !== slides.length)
  )
    findings.push(
      finding(
        "RENDER_EVIDENCE_INVALID",
        "evidence.render.json",
        "render evidence must bind current sources and every rendered output",
      ),
    );
}

function validateEvidence(
  model: PptxModel,
  slides: unknown[],
  findings: ContractFinding[],
) {
  const files = model.files ?? {};
  const pptxPath = `dist/${model.artifactId}.pptx`;
  const structure = schemaRecord(
    files,
    "evidence.structure.json",
    STRUCTURE_EVIDENCE_SCHEMA,
    "STRUCTURE_EVIDENCE_INVALID",
    findings,
  );
  if (
    structure &&
    (!sourceDigestRecord(model, structure) ||
      rec(structure.output)?.sha256 !== model.digests?.[pptxPath] ||
      rec(structure.package)?.slideCount !== slides.length ||
      structure.verdict !== "pass")
  )
    findings.push(
      finding(
        "STRUCTURE_EVIDENCE_INVALID",
        "evidence.structure.json",
        "structure evidence must pass and bind current PPTX structure",
      ),
    );
  const design = schemaRecord(
    files,
    "evidence.design.json",
    DESIGN_EVIDENCE_SCHEMA,
    "DESIGN_EVIDENCE_INVALID",
    findings,
  );
  const designChecks = list(design?.checks)
    .map(rec)
    .filter((check): check is JsonRecord => Boolean(check));
  const designRoles = rec(
    rec(parseJson(files, "design.system.json"))?.typography,
  )?.roles;
  const requiredTypeRoles = Object.keys(rec(designRoles) ?? {});
  const layoutRhythm = rec(design?.layoutRhythm);
  const layoutPages = list(layoutRhythm?.pages);
  const textRhythmPages = list(rec(design?.textRhythm)?.pages);
  const compositionSignals = list(design?.compositionSignals);
  const deckSignals = list(design?.deckSignals);
  const textFitSignals = list(design?.textFitSignals);
  if (
    design &&
    (!sourceDigestRecord(model, design) ||
      design.designSystemSha256 !== model.digests?.["design.system.json"] ||
      design.verdict !== "pass" ||
      !designChecks.length ||
      designChecks.some((check) => check.status !== "pass") ||
      requiredTypeRoles.some(
        (role) =>
          !designChecks.some(
            (check) =>
              check.criterion === `typography:${role}` &&
              check.source === "design-system-measurement",
          ),
      ) ||
      layoutPages.length !== slides.length ||
      layoutPages.some(
        (entry, index) =>
          rec(entry)?.index !== index + 1 ||
          !Array.isArray(rec(entry)?.fingerprint) ||
          !Number.isInteger(rec(entry)?.bodyObjectCount),
      ) ||
      !Array.isArray(layoutRhythm?.similarGroups) ||
      textRhythmPages.length !== slides.length ||
      textRhythmPages.some(
        (entry, index) =>
          rec(entry)?.index !== index + 1 ||
          !Number.isInteger(rec(entry)?.governedTextObjects) ||
          rec(entry)?.autofitObjects !== 0,
      ) ||
      !Array.isArray(design.headlineSignals) ||
      !Array.isArray(design.deckSignals) ||
      deckSignals.some((entry) => {
        const signal = rec(entry);
        return (
          !signal ||
          !ID.test(String(signal.id ?? "")) ||
          signal.severity !== "blocking" ||
          !Array.isArray(signal.pages) ||
          !signal.pages.length ||
          signal.pages.some(
            (page) =>
              !Number.isInteger(page) ||
              Number(page) < 1 ||
              Number(page) > slides.length,
          ) ||
          typeof signal.evidence !== "string" ||
          !signal.evidence.trim()
        );
      }) ||
      !Array.isArray(design.textFitSignals) ||
      textFitSignals.some((entry) => {
        const signal = rec(entry);
        return (
          !signal ||
          !Number.isInteger(signal.page) ||
          Number(signal.page) < 1 ||
          Number(signal.page) > slides.length ||
          !["overflow", "orphan-line-risk"].includes(String(signal.kind)) ||
          typeof signal.object !== "string" ||
          !signal.object
        );
      }) ||
      compositionSignals.length !== slides.length ||
      compositionSignals.some(
        (entry, index) =>
          rec(entry)?.page !== index + 1 ||
          !Array.isArray(rec(entry)?.signals),
      ))
  )
    findings.push(
      finding(
        "DESIGN_EVIDENCE_INVALID",
        "evidence.design.json",
        "design evidence must bind typography measurements, emitted text rhythm, deck signals, text-fit signals, and per-page composition fingerprints",
      ),
    );
  const accessibility = schemaRecord(
    files,
    "evidence.accessibility.json",
    ACCESSIBILITY_EVIDENCE_SCHEMA,
    "ACCESSIBILITY_EVIDENCE_INVALID",
    findings,
  );
  if (
    accessibility &&
    (!sourceDigestRecord(model, accessibility) ||
      accessibility.outputSha256 !== model.digests?.[pptxPath] ||
      accessibility.verdict !== "pass" ||
      !Array.isArray(accessibility.checks) ||
      !accessibility.checks.length ||
      accessibility.checks.some(
        (entry) =>
          !isObject(entry) ||
          ![
            "measurement",
            "tool-report",
            "manual-walkthrough",
            "content-review",
          ].includes(String(entry.source)) ||
          entry.status !== "pass",
      ))
  )
    findings.push(
      finding(
        "ACCESSIBILITY_EVIDENCE_INVALID",
        "evidence.accessibility.json",
        "accessibility evidence must bind the final PPTX and contain passing, attributable checks",
      ),
    );
}

export function presentationReviewChecksValid(
  value: unknown,
  relationshipRequired: boolean,
  groupingRequired: boolean,
  allowedAnchors?: ReadonlySet<string>,
) {
  const checks = rec(value);
  if (!checks) return false;
  return REVIEW_CHECKS.every((name) => {
    const check = rec(checks[name]);
    if (
      !check ||
      !["pass", "not-applicable"].includes(String(check.status)) ||
      !Array.isArray(check.anchors) ||
      !check.anchors.length ||
      !check.anchors.every((anchor) => {
        if (anchor === "deck") return true;
        if (typeof anchor !== "string" || !anchor.startsWith("slide:"))
          return false;
        return !allowedAnchors || allowedAnchors.has(anchor);
      }) ||
      typeof check.evidence !== "string" ||
      !check.evidence.trim()
    )
      return false;
    if (check.status === "not-applicable")
      return (
        ((name === "relationshipSemantics" && !relationshipRequired) ||
          (name === "groupingSemantics" && !groupingRequired)) &&
        typeof check.rationale === "string" &&
        Boolean(check.rationale.trim())
      );
    return true;
  });
}

export function presentationPageAuditsValid(
  pages: unknown[],
  storyboardSlides: unknown[],
  headlineSignalPages: ReadonlySet<number> = new Set(),
  compositionSignalPages: ReadonlySet<number> = new Set(),
  textFitSignalPages: ReadonlySet<number> = new Set(),
) {
  return pages.every((rawPage, index) => {
    const page = rec(rawPage);
    const audits = rec(page?.audits);
    const slide = rec(storyboardSlides[index]);
    if (!audits || !slide) return false;
    const requiredPass = [
      ["headlineVoice", new Set(["plain", "specific"])],
      ["typographyRhythm", undefined],
      ["contentEncoding", undefined],
      ["distanceLegibility", undefined],
    ] as const;
    for (const [name, classifications] of requiredPass) {
      const audit = rec(audits[name]);
      if (
        !audit ||
        audit.status !== "pass" ||
        typeof audit.evidence !== "string" ||
        !audit.evidence.trim() ||
        (classifications &&
          !classifications.has(String(audit.classification)))
      )
        return false;
      if (
        ((name === "headlineVoice" && headlineSignalPages.has(index + 1)) ||
          (name === "typographyRhythm" &&
            textFitSignalPages.has(index + 1)) ||
          (name === "contentEncoding" &&
            compositionSignalPages.has(index + 1))) &&
        (typeof audit.signalDisposition !== "string" ||
          !audit.signalDisposition.trim())
      )
        return false;
    }
    const visual = rec(slide.visual);
    for (const [name, required] of [
      ["grouping", list(visual?.groups).length > 0],
      ["readingPath", visual?.type === "diagram"],
    ] as const) {
      const audit = rec(audits[name]);
      if (
        !audit ||
        !["pass", "not-applicable"].includes(String(audit.status)) ||
        typeof audit.evidence !== "string" ||
        !audit.evidence.trim() ||
        (required && audit.status !== "pass") ||
        (!required &&
          audit.status === "not-applicable" &&
          (typeof audit.rationale !== "string" || !audit.rationale.trim()))
      )
        return false;
    }
    return true;
  });
}

export function presentationReviewFindingsValid(
  value: unknown,
  allowedAnchors?: ReadonlySet<string>,
  pageHashes?: ReadonlyMap<number, string>,
) {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    const reviewFinding = rec(entry);
    if (
      !reviewFinding ||
      typeof reviewFinding.id !== "string" ||
      !ID.test(reviewFinding.id) ||
      !["low", "medium", "high", "critical"].includes(
        String(reviewFinding.severity),
      ) ||
      typeof reviewFinding.anchor !== "string" ||
      !reviewFinding.anchor.trim() ||
      (reviewFinding.anchor !== "deck" &&
        allowedAnchors &&
        !allowedAnchors.has(reviewFinding.anchor)) ||
      typeof reviewFinding.evidence !== "string" ||
      !reviewFinding.evidence.trim() ||
      typeof reviewFinding.recovery !== "string" ||
      !reviewFinding.recovery.trim() ||
      !["resolved", "accepted"].includes(
        String(reviewFinding.disposition),
      ) ||
      (reviewFinding.page !== undefined &&
        (!Number.isInteger(reviewFinding.page) ||
          Number(reviewFinding.page) < 1 ||
          (pageHashes && !pageHashes.has(Number(reviewFinding.page)))))
    )
      return false;
    if (reviewFinding.disposition === "resolved") {
      const page = Number(reviewFinding.page);
      return (
        typeof reviewFinding.resolutionEvidence === "string" &&
        Boolean(reviewFinding.resolutionEvidence.trim()) &&
        (reviewFinding.page === undefined ||
          !pageHashes ||
          reviewFinding.resolutionPageSha256 === pageHashes.get(page))
      );
    }
    return (
      !["high", "critical"].includes(String(reviewFinding.severity)) &&
      typeof reviewFinding.acceptanceReason === "string" &&
      Boolean(reviewFinding.acceptanceReason.trim())
    );
  });
}

function validateReview(
  model: PptxModel,
  slides: unknown[],
  findings: ContractFinding[],
) {
  const files = model.files ?? {};
  const review = schemaRecord(
    files,
    "review.pptx.json",
    REVIEW_SCHEMA,
    "REVIEW_INVALID",
    findings,
  );
  const reviewer = rec(review?.reviewer);
  const pages = list(review?.pages);
  const render = rec(parseJson(files, "evidence.render.json"));
  const storyboard = rec(parseJson(files, "plan.storyboard.json"));
  const relationshipRequired = list(storyboard?.slides).some((entry) => {
    const visual = rec(rec(entry)?.visual);
    return visual?.type === "diagram";
  });
  const groupingRequired = list(storyboard?.slides).some(
    (entry) => list(rec(rec(entry)?.visual)?.groups).length > 0,
  );
  const storyboardSlides = list(storyboard?.slides);
  const designEvidence = rec(parseJson(files, "evidence.design.json"));
  const blockingDeckSignals = list(designEvidence?.deckSignals).filter(
    (entry) => rec(entry)?.severity === "blocking",
  );
  const headlineSignalPages = new Set(
    list(designEvidence?.headlineSignals).map((entry) => Number(rec(entry)?.page)),
  );
  const compositionSignalPages = new Set(
    list(designEvidence?.compositionSignals)
      .filter((entry) => list(rec(entry)?.signals).length > 0)
      .map((entry) => Number(rec(entry)?.page)),
  );
  const textFitSignalPages = new Set(
    list(designEvidence?.textFitSignals).map((entry) =>
      Number(rec(entry)?.page),
    ),
  );
  const reviewAnchors = new Set(
    list(storyboard?.slides).map(
      (entry) => `slide:${String(rec(entry)?.id ?? "")}`,
    ),
  );
  const reviewPageHashes = new Map(
    pages.map((entry) => [
      Number(rec(entry)?.index),
      String(rec(entry)?.sha256 ?? ""),
    ]),
  );
  if (
    review &&
    (!sourceDigestRecord(model, review) ||
      review.verdict !== "pass" ||
      !reviewer ||
      !["human", "independent-agent"].includes(String(reviewer.kind)) ||
      typeof reviewer.sessionId !== "string" ||
      !reviewer.sessionId ||
      reviewer.sessionId === render?.sessionId ||
      pages.length !== slides.length ||
      pages.some(
        (entry, index) =>
          rec(entry)?.index !== index + 1 ||
          rec(entry)?.sha256 !==
            model.digests?.[
              `dist/pages/${String(index + 1).padStart(3, "0")}.png`
            ] ||
          rec(entry)?.verdict !== "pass",
      ) ||
      !presentationPageAuditsValid(
        pages,
        storyboardSlides,
        headlineSignalPages,
        compositionSignalPages,
        textFitSignalPages,
      ) ||
      !presentationReviewFindingsValid(
        review.findings,
        reviewAnchors,
        reviewPageHashes,
      ) ||
      blockingDeckSignals.length > 0 ||
      !presentationReviewChecksValid(
        review.checks,
        relationshipRequired,
        groupingRequired,
        reviewAnchors,
      ))
  )
    findings.push(
      finding(
        "REVIEW_INVALID",
        "review.pptx.json",
        "review must be independent, cover every page, complete all quality checks, and disposition findings with evidence",
      ),
    );
  const plan = rec(parseJson(files, "plan.contract.json"));
  const core = rec(plan?.communicationCore);
  if (!communicationReviewValid(review, core?.retellTarget, communicationAnchors(core))) findings.push(finding("COMMUNICATION_REVIEW_INVALID", "review.pptx.json", "presentation review must record a two-pass retell and bind every communication check to the frozen signature cue"));
}

export function createPptxReleaseManifest(model: PptxModel) {
  const outputPaths = releaseOutputPaths(model).filter(
    (path) => path !== "release.manifest.json",
  );
  return {
    schema: RELEASE_MANIFEST_SCHEMA,
    plugin: "presentation-production",
    artifactId: model.artifactId,
    subjectDigest: computePptxSubjectDigest(model),
    outputs: outputPaths.map((path) => ({
      path,
      sha256: fileDigest(model, path),
    })),
    roles: {
      pptx: `dist/${model.artifactId}.pptx`,
      pdf: `dist/${model.artifactId}.pdf`,
      pages: "dist/pages",
      structure: "evidence.structure.json",
      design: "evidence.design.json",
      accessibility: "evidence.accessibility.json",
      review: "review.pptx.json",
    },
  };
}

function validateRelease(model: PptxModel, findings: ContractFinding[]) {
  const files = model.files ?? {};
  const manifest = schemaRecord(
    files,
    "release.manifest.json",
    RELEASE_MANIFEST_SCHEMA,
    "RELEASE_MANIFEST_INVALID",
    findings,
  );
  if (manifest) {
    const expected = createPptxReleaseManifest(model);
    if (
      manifest.artifactId !== expected.artifactId ||
      manifest.subjectDigest !== expected.subjectDigest ||
      JSON.stringify(manifest.outputs) !== JSON.stringify(expected.outputs) ||
      JSON.stringify(manifest.roles) !== JSON.stringify(expected.roles)
    )
      findings.push(
        finding(
          "RELEASE_MANIFEST_INVALID",
          "release.manifest.json",
          "release manifest must bind every current output and delivery role",
        ),
      );
  }
  if (!validatePptxReceipt(model))
    findings.push(
      finding(
        "RECEIPT_INVALID",
        "receipt.release.json",
        "release receipt must bind current sources and outputs",
      ),
    );
}

export function validatePptxModel(
  model: PptxModel | null | undefined,
  { stage = "source" }: PptxValidateOptions = {},
): ContractFinding[] {
  if (typeof stage !== "string" || !STAGES.has(stage as PptxStage))
    return [
      finding(
        "STAGE_INVALID",
        "plan.contract.json",
        `unsupported PPTX stage: ${String(stage)}`,
      ),
    ];
  const currentStage = stage as PptxStage;
  const findings: ContractFinding[] = [];
  const current = model ?? {};
  const files = current.files ?? {};
  if (".pptx-delivery-journal.json" in files)
    findings.push(
      finding(
        "MUTATION_JOURNAL_OPEN",
        ".pptx-delivery-journal.json",
        "an interrupted writer must be resumed or recovered",
      ),
    );
  validateRequiredSource(files, findings);
  validateGitignore(files, findings);
  const { storyboardSlides } = validateSourceSchemas(current, files, findings);
  const slides = validateManifest(files, storyboardSlides, findings);
  if (stageAtLeast(currentStage, "render"))
    validateRendered(current, slides, storyboardSlides, findings);
  if (stageAtLeast(currentStage, "probe"))
    validateEvidence(current, slides, findings);
  if (stageAtLeast(currentStage, "review"))
    validateReview(current, slides, findings);
  if (stageAtLeast(currentStage, "release")) validateRelease(current, findings);
  return findings.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.path.localeCompare(right.path),
  );
}

export function evaluatePptxWrite({
  relativePath = "",
  toolName = "",
  writer = "",
  cwd = "",
}: PptxWriteOptions = {}): PptxWriteDecision {
  const normalized = resolve(cwd || ".", relativePath).replaceAll("\\", "/");
  const marker = "/artifacts/pptx/";
  const offset = normalized.indexOf(marker);
  if (offset < 0) return { decision: "allow" };
  const inside = normalized
    .slice(offset + marker.length)
    .split("/")
    .slice(1)
    .join("/");
  const preview = inside.startsWith("src/slides/") && inside.endsWith(".png");
  const generated =
    inside === ".pptx-delivery-journal.json" ||
    GENERATED_PATH.test(inside) ||
    preview;
  if (generated && !/^pptx-(?:render|probe|review|release)$/u.test(writer))
    return {
      decision: "deny",
      code: "PROTECTED_WRITER_REQUIRED",
      message: `${inside} must be written by a registered presentation-production writer, not ${toolName || "an unregistered tool"}`,
    };
  return { decision: "allow" };
}

export function resolveWorkspaceRoot(cwd: string) {
  const absolute = resolve(cwd);
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: absolute,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (root) return resolve(root);
  } catch {}
  const parts = absolute.split(sep);
  for (let index = parts.length - 3; index >= 0; index -= 1)
    if (parts[index] === "artifacts" && parts[index + 1] === "pptx")
      return resolve(parts.slice(0, index).join(sep) || sep);
  return absolute;
}

export function isPptxProjectRoot(projectRoot: string, workspaceRoot: string) {
  return (
    dirname(resolve(projectRoot)) ===
      join(resolve(workspaceRoot), "artifacts", "pptx") &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))
  );
}

function isTextPath(filePath: string) {
  return (
    TEXT_BASENAMES.has(basename(filePath)) ||
    TEXT_EXTENSIONS.has(extname(filePath).toLowerCase())
  );
}

async function hashFile(
  filePath: string,
  maxBytes: number,
  collectBytes: boolean,
) {
  const before = await lstat(filePath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error(`NOT_A_FILE:${filePath}`);
  if (before.size > BigInt(maxBytes))
    throw new Error(`FILE_SIZE_LIMIT_EXCEEDED:${filePath}`);
  const hash = createHash("sha256");
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    bytes += chunk.byteLength;
    hash.update(chunk);
    if (collectBytes) chunks.push(chunk);
  }
  const after = await lstat(filePath, { bigint: true });
  if (before.size !== after.size || before.mtimeNs !== after.mtimeNs)
    throw new Error(`FILE_CHANGED_DURING_READ:${filePath}`);
  return {
    digest: hash.digest("hex"),
    bytes,
    content: collectBytes ? Buffer.concat(chunks) : null,
  };
}

async function collect(
  root: string,
  directory: string,
  state: {
    files: FileMap;
    digests: DigestMap;
    sizes: Record<string, number>;
    count: number;
  },
  limits: { maxFiles: number; maxBytesPerFile: number; maxTextBytes: number },
) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const relativePath = relative(root, absolute).replaceAll("\\", "/");
    if (entry.isSymbolicLink())
      throw new Error(`SYMLINK_REJECTED:${relativePath}`);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name))
        await collect(root, absolute, state, limits);
      continue;
    }
    if (!entry.isFile()) continue;
    state.count += 1;
    if (state.count > limits.maxFiles)
      throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
    const text = isTextPath(relativePath);
    const result = await hashFile(
      absolute,
      text
        ? Math.min(limits.maxBytesPerFile, limits.maxTextBytes)
        : limits.maxBytesPerFile,
      true,
    );
    state.digests[relativePath] = result.digest;
    state.sizes[relativePath] = result.bytes;
    if (!result.content) state.files[relativePath] = null;
    else if (text) {
      try {
        state.files[relativePath] = UTF8.decode(result.content);
      } catch {
        throw new Error(`PROJECT_TEXT_ENCODING_INVALID:${relativePath}`);
      }
    } else state.files[relativePath] = result.content;
  }
}

export async function loadPptxProject(
  projectRoot: string,
  limits: PptxLoadLimits = {},
): Promise<PptxModel> {
  const root = resolve(projectRoot);
  const state = {
    files: {} as FileMap,
    digests: {} as DigestMap,
    sizes: {} as Record<string, number>,
    count: 0,
  };
  await collect(root, root, state, {
    maxFiles: limits.maxFiles ?? 4096,
    maxBytesPerFile: limits.maxBytesPerFile ?? 256 * 1024 * 1024,
    maxTextBytes: limits.maxTextBytes ?? 4 * 1024 * 1024,
  });
  return {
    artifactId: basename(root),
    root,
    files: state.files,
    digests: state.digests,
    sizes: state.sizes,
    plan: parseJson(state.files, "plan.contract.json"),
    project: parseJson(state.files, "pptx.project.json"),
    tracked: [],
    ignored: [],
  };
}

export async function findPptxProjects(
  cwd: string,
  { maxProjects = 32 }: { maxProjects?: number } = {},
) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const carrierRoot = join(workspaceRoot, "artifacts", "pptx");
  let entries;
  try {
    entries = await readdir(carrierRoot, { withFileTypes: true });
  } catch (error) {
    if (isObject(error) && error.code === "ENOENT") return [];
    throw error;
  }
  const roots: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink())
      throw new Error(`SYMLINK_REJECTED:artifacts/pptx/${entry.name}`);
    if (!entry.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name))
      continue;
    const root = join(carrierRoot, entry.name);
    try {
      if ((await lstat(join(root, "plan.contract.json"))).isFile())
        roots.push(root);
    } catch (error) {
      if (!(isObject(error) && error.code === "ENOENT")) throw error;
    }
    if (roots.length > maxProjects)
      throw new Error("PROJECT_COUNT_LIMIT_EXCEEDED");
  }
  return roots.sort();
}
