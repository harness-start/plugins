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

import { DOMParser } from "@xmldom/xmldom";
import { unzipSync } from "fflate";

export const PLAN_SCHEMA = "presentation-production/plan/v2";
export const STORYBOARD_SCHEMA = "presentation-production/storyboard/v2";
export const SKILL_COMPOSITION_SCHEMA =
  "presentation-production/skill-composition/v1";
export const DESIGN_SYSTEM_SCHEMA = "presentation-production/design-system/v2";
export const PROJECT_SCHEMA = "presentation-production/project/v2";
export const SLIDE_MANIFEST_SCHEMA =
  "presentation-production/slide-manifest/v2";
export const RENDER_EVIDENCE_SCHEMA =
  "presentation-production/render-evidence/v1";
export const STRUCTURE_EVIDENCE_SCHEMA =
  "presentation-production/structure-evidence/v2";
export const DESIGN_EVIDENCE_SCHEMA =
  "presentation-production/design-evidence/v1";
export const ACCESSIBILITY_EVIDENCE_SCHEMA =
  "presentation-production/accessibility-evidence/v2";
export const REVIEW_SCHEMA = "presentation-production/review/v2";
export const RELEASE_MANIFEST_SCHEMA =
  "presentation-production/release-manifest/v2";
export const RECEIPT_SCHEMA = "presentation-production/receipt/v2";

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
    "src/theme.ts",
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
    !["display", "title", "section", "body", "caption", "numeric"].every(
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
          ["cjk", "latin", "mixed"].includes(String(role.scriptPolicy))
        );
      },
    )
  )
    findings.push(
      finding(
        "DESIGN_SYSTEM_INVALID",
        "design.system.json",
        "typography roles must declare family, point size, line spacing, character spacing, line limit, and script policy",
      ),
    );
  if (
    !spacing ||
    Number(spacing.pageMarginIn) < 0.3 ||
    Number(spacing.baseUnitIn) <= 0 ||
    Number(spacing.blockGapIn) <= 0 ||
    Number(spacing.paragraphGapIn) <= 0
  )
    findings.push(
      finding(
        "DESIGN_SYSTEM_INVALID",
        "design.system.json",
        "spacing must declare pageMarginIn >= 0.3 and positive baseUnitIn, blockGapIn, and paragraphGapIn",
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
      typeof plan.audience !== "string" ||
      typeof plan.objective !== "string" ||
      typeof plan.language !== "string")
  )
    findings.push(
      finding(
        "PLAN_INVALID",
        "plan.contract.json",
        "plan must bind artifactId, targetStage, audience, objective, and language",
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
  if (
    storyboard &&
    (!storyboardSlides.length ||
      !storyboardSlides.every(
        (entry, index) =>
          rec(entry)?.index === index + 1 &&
          typeof rec(entry)?.id === "string" &&
          typeof rec(entry)?.title === "string" &&
          typeof rec(entry)?.role === "string" &&
          typeof rec(entry)?.visualType === "string",
      ))
  )
    findings.push(
      finding(
        "STORYBOARD_INVALID",
        "plan.storyboard.json",
        "storyboard slides must be non-empty, contiguous, and declare id, title, role, and visualType",
      ),
    );
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
      typeof item.title !== "string" ||
      typeof item.role !== "string" ||
      !isObject(item.accessibility)
    )
      findings.push(
        finding(
          "SLIDE_SEQUENCE_INVALID",
          "src/slides/manifest.json",
          "slide indexes and ids must be unique, contiguous, and include title, role, and accessibility",
        ),
      );
    ids.add(item?.id);
    validateSlideSource(files, entry, findings);
  });
  if (
    storyboardSlides.length &&
    (storyboardSlides.length !== slides.length ||
      storyboardSlides.some(
        (entry, index) => rec(entry)?.id !== rec(slides[index])?.id,
      ))
  )
    findings.push(
      finding(
        "STORYBOARD_MANIFEST_MISMATCH",
        "src/slides/manifest.json",
        "manifest must preserve storyboard page count and ids",
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
};

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

function validateRendered(
  model: PptxModel,
  slides: unknown[],
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
      ))
  )
    findings.push(
      finding(
        "DESIGN_EVIDENCE_INVALID",
        "evidence.design.json",
        "design evidence must bind the design system and cover every typography role with passing carrier measurements",
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
      !Array.isArray(review.findings) ||
      review.findings.some(
        (entry) =>
          !isObject(entry) ||
          !["resolved", "accepted"].includes(String(entry.disposition)),
      ))
  )
    findings.push(
      finding(
        "REVIEW_INVALID",
        "review.pptx.json",
        "review must be independent, cover every current page, and disposition every finding",
      ),
    );
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
    validateRendered(current, slides, findings);
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
