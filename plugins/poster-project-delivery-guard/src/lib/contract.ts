import { createHash, type BinaryLike } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { inflateSync } from "node:zlib";

import { DOMParser } from "@xmldom/xmldom";

export const POSTER_PROFILES = ["regional-culture", "mondo", "editorial", "academic", "custom"] as const;
export const POSTER_STAGES = ["source", "design", "render", "probe", "review", "release"] as const;
export const PLAN_SCHEMA = "poster-project-delivery-guard/plan/v2";
export const ART_DIRECTION_SCHEMA = "poster-project-delivery-guard/art-direction/v1";
export const SKILL_COMPOSITION_SCHEMA = "poster-project-delivery-guard/skill-composition/v1";
export const ASSET_MANIFEST_SCHEMA = "poster-project-delivery-guard/assets/v2";
export const DESIGN_SYSTEM_SCHEMA = "poster-project-delivery-guard/design-system/v1";
export const PROJECT_SCHEMA = "poster-project-delivery-guard/project/v2";
export const VARIANT_MANIFEST_SCHEMA = "poster-project-delivery-guard/variant-manifest/v2";
export const LAYER_MANIFEST_SCHEMA = "poster-project-delivery-guard/layer-manifest/v2";
export const RENDER_EVIDENCE_SCHEMA = "poster-project-delivery-guard/render/v1";
export const PROBE_EVIDENCE_SCHEMA = "poster-project-delivery-guard/probe/v1";
export const ACCESSIBILITY_EVIDENCE_SCHEMA = "poster-project-delivery-guard/accessibility/v2";
export const REVIEW_SCHEMA = "poster-project-delivery-guard/review/v2";
export const RELEASE_MANIFEST_SCHEMA = "poster-project-delivery-guard/release-manifest/v2";

export type PosterProfile = typeof POSTER_PROFILES[number];
export type PosterStage = typeof POSTER_STAGES[number];
export type FileContent = string | Buffer;
export type FileMap = Record<string, FileContent>;
export type DigestMap = Record<string, string>;
export type BytesMap = Record<string, Buffer>;
export type JsonRecord = Record<string, unknown>;
export type ContractFinding = { code: string; path: string; message: string };
export type PosterModel = { artifactId?: string; root?: string; files?: FileMap; bytes?: BytesMap; digests?: DigestMap; plan?: unknown; project?: unknown };
export type PosterValidateOptions = { stage?: unknown };
export type PosterWriteOptions = { relativePath?: string; toolName?: string; writer?: string; cwd?: string };
export type PosterWriteDecision = { decision: "allow" } | { decision: "deny"; code: string; message: string };
export type PosterReceipt = { schemaVersion: number; plugin: string; artifactId: string | undefined; stage: string; subjectDigest: string; outputs: Record<string, string> };

const STAGE_RANK: Record<PosterStage, number> = { source: 0, design: 1, render: 2, probe: 3, review: 4, release: 5 };
const PROFILE_SET = new Set<string>(POSTER_PROFILES);
const STAGE_SET = new Set<string>(POSTER_STAGES);
const VARIANT_DIRECTORY = /^(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)$/u;
const LAYER_SOURCE = /^(?<index>[0-9]{3})-(?<role>background|media|overlay|decoration|title|body|metadata|brand|cta)-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.tsx$/u;
const OWNER_VIOLATION = /(?:\bzIndex\s*:|from\s+["'](?:satori|@resvg\/resvg-js|node:|fs|child_process|http|https|net|tls|dns)|\b(?:import|require|fetch|setTimeout|setInterval)\s*\(|\b(?:process|globalThis|performance|crypto)\.|\b(?:Date\.now|Math\.random)\s*\(|\bnew\s+Date\b|\b(?:useState|useEffect|useLayoutEffect)\s*\(|<\s*(?:script|style|link|iframe)\b|https?:\/\/)/u;
const GENERATED_PATH = /^(?:dist\/|evidence(?:\.|\/)|review\.poster\.json$|release\.manifest\.json$|receipt\.release\.json$|\.poster-delivery-journal\.json$|\.tmp\/poster-guard\/)/u;
const SUBJECT_EXCLUDED_PATH = /^(?:dist\/|evidence(?:\.|\/)|review\.poster\.json$|release\.manifest\.json$|receipt\.release\.json$|\.poster-delivery-journal\.json$|\.tmp\/)/u;
const SOURCE_PROOF = /^src\/variants\/.+\.[0-9a-f]{64}\.(?:png|svg)$/u;
const SOURCE_PROOF_PATH = /^src\/variants\/.+\.(?:png|svg)$/u;
const REQUIRED_SOURCE_FILES = [".gitignore", "package.json", "package-lock.json", "src/render.ts", "src/compose.ts", "src/theme.ts"];
const REQUIRED_ADVISORS = new Map([
  ["regional-culture-poster", "e8f37639833b341c0d2f0b30c89b07faf5e2f458"],
  ["qiaomu-mondo-poster-design", "e82e411c403ca5a0327a85682c658ad155cd9cbb"],
  ["cvpr-2026-poster", "63892ddcd10e88ab9081eea8d25adb797cf18946"],
  ["impeccable", "5a149f3fdb1b5793f10567233b1dcab98fc305fd"],
]);
const REVIEW_CHECKS = ["hierarchy", "typography", "legibility", "clipping", "color", "copy", "profileFidelity", "assetIntegrity"];

const sha256 = (value: BinaryLike): string => createHash("sha256").update(value).digest("hex");
const finding = (code: string, path: string, message: string): ContractFinding => ({ code, path, message });
const isObject = (value: unknown): value is JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value);
const record = (value: unknown): JsonRecord => isObject(value) ? value : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const textOf = (value: unknown): string => Buffer.isBuffer(value) ? value.toString("utf8") : typeof value === "string" ? value : "";
const rawBytes = (model: PosterModel | null | undefined, path: string): Buffer => model?.bytes?.[path] ?? (Buffer.isBuffer(model?.files?.[path]) ? model.files[path] as Buffer : Buffer.from(textOf(model?.files?.[path])));
const digestOf = (model: PosterModel | null | undefined, path: string): string => model?.digests?.[path] ?? sha256(rawBytes(model, path));
const stageAtLeast = (stage: PosterStage, expected: PosterStage) => STAGE_RANK[stage] >= STAGE_RANK[expected];

function parseJson(files: FileMap, path: string, findings: ContractFinding[]): unknown {
  if (!(path in files)) { findings.push(finding("REQUIRED_PATH_MISSING", path, `${path} is required`)); return null; }
  try { return JSON.parse(textOf(files[path])) as unknown; }
  catch { findings.push(finding("JSON_INVALID", path, `${path} must contain valid JSON`)); return null; }
}

function parseDimension(value: string | null): number {
  const match = String(value ?? "").trim().match(/^([0-9]+(?:\.[0-9]+)?)(?:px)?$/u);
  return match ? Number(match[1]) : Number.NaN;
}

export function inspectPosterSvg(bytes: Buffer): { width: number; height: number; viewBox: [number, number, number, number] } {
  const source = bytes.toString("utf8");
  if (bytes.byteLength < 40 || /<!DOCTYPE|<!ENTITY|<(?:script|foreignObject)\b|\son[a-z]+\s*=/iu.test(source)) throw new Error("SVG_UNSAFE");
  if (/\b(?:href|xlink:href)\s*=\s*["'](?:https?:|file:|\/\/)|\burl\(\s*["']?(?:https?:|file:|\/\/)/iu.test(source)) throw new Error("SVG_EXTERNAL_REFERENCE");
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = document.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg" || document.getElementsByTagName("parsererror").length > 0) throw new Error("SVG_INVALID");
  const width = parseDimension(root.getAttribute("width"));
  const height = parseDimension(root.getAttribute("height"));
  const viewBoxParts = String(root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/u).map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || viewBoxParts.length !== 4 || viewBoxParts.some((part) => !Number.isFinite(part)) || (viewBoxParts[2] ?? 0) <= 0 || (viewBoxParts[3] ?? 0) <= 0) throw new Error("SVG_DIMENSIONS_INVALID");
  return { width, height, viewBox: viewBoxParts as [number, number, number, number] };
}

export function inspectPosterPng(bytes: Buffer): { width: number; height: number; alphaCoverage: number } {
  try {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (bytes.byteLength < 57 || !bytes.subarray(0, 8).equals(signature)) throw new Error("PNG_INVALID");
    let cursor = 8;
    let width = 0;
    let height = 0;
    let sawHeader = false;
    let sawEnd = false;
    const compressed: Buffer[] = [];
    while (cursor < bytes.byteLength) {
      if (cursor + 12 > bytes.byteLength) throw new Error("PNG_INVALID");
      const length = bytes.readUInt32BE(cursor);
      const type = bytes.subarray(cursor + 4, cursor + 8);
      const dataStart = cursor + 8;
      const dataEnd = dataStart + length;
      if (length > 64 * 1024 * 1024 || dataEnd + 4 > bytes.byteLength) throw new Error("PNG_INVALID");
      const expectedCrc = bytes.readUInt32BE(dataEnd);
      if (pngCrc32(Buffer.concat([type, bytes.subarray(dataStart, dataEnd)])) !== expectedCrc) throw new Error("PNG_INVALID");
      const chunkType = type.toString("ascii");
      if (chunkType === "IHDR") {
        if (sawHeader || cursor !== 8 || length !== 13) throw new Error("PNG_INVALID");
        width = bytes.readUInt32BE(dataStart);
        height = bytes.readUInt32BE(dataStart + 4);
        const bitDepth = bytes[dataStart + 8];
        const colorType = bytes[dataStart + 9];
        const compression = bytes[dataStart + 10];
        const filter = bytes[dataStart + 11];
        const interlace = bytes[dataStart + 12];
        if (width <= 0 || height <= 0 || width > 8192 || height > 8192 || bitDepth !== 8 || colorType !== 6 || compression !== 0 || filter !== 0 || interlace !== 0) throw new Error("PNG_INVALID");
        sawHeader = true;
      } else if (chunkType === "IDAT") compressed.push(bytes.subarray(dataStart, dataEnd));
      else if (chunkType === "IEND") {
        if (length !== 0 || !sawHeader) throw new Error("PNG_INVALID");
        sawEnd = true;
        cursor = dataEnd + 4;
        break;
      }
      cursor = dataEnd + 4;
    }
    if (!sawHeader || !sawEnd || cursor !== bytes.byteLength || compressed.length === 0) throw new Error("PNG_INVALID");
    const rowBytes = width * 4;
    const raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: height * (rowBytes + 1) });
    if (raw.byteLength !== height * (rowBytes + 1)) throw new Error("PNG_INVALID");
    let opaque = 0;
    let previous = Buffer.alloc(rowBytes);
    let offset = 0;
    for (let y = 0; y < height; y += 1) {
      const filterType = raw[offset++] ?? -1;
      const row = Buffer.from(raw.subarray(offset, offset + rowBytes));
      offset += rowBytes;
      if (filterType < 0 || filterType > 4) throw new Error("PNG_INVALID");
      for (let x = 0; x < rowBytes; x += 1) {
        const encoded = row[x] ?? 0;
        const left = x >= 4 ? row[x - 4] ?? 0 : 0;
        const up = previous[x] ?? 0;
        const upLeft = x >= 4 ? previous[x - 4] ?? 0 : 0;
        const predictor = filterType === 1 ? left : filterType === 2 ? up : filterType === 3 ? Math.floor((left + up) / 2) : filterType === 4 ? paeth(left, up, upLeft) : 0;
        row[x] = (encoded + predictor) & 255;
      }
      for (let x = 3; x < rowBytes; x += 4) if ((row[x] ?? 0) > 0) opaque += 1;
      previous = row;
    }
    return { width, height, alphaCoverage: opaque / (width * height) };
  } catch { throw new Error("PNG_INVALID"); }
}

const PNG_CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function pngCrc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (PNG_CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonalDistance = Math.abs(estimate - upLeft);
  return leftDistance <= upDistance && leftDistance <= diagonalDistance ? left : upDistance <= diagonalDistance ? up : upLeft;
}

export function computePosterSubjectDigest(model: PosterModel | null | undefined): string {
  const paths = Object.keys(model?.files ?? {}).filter((path) => !SUBJECT_EXCLUDED_PATH.test(path) && !SOURCE_PROOF.test(path)).sort();
  return sha256(paths.map((path) => `${path}\0${digestOf(model, path)}\n`).join(""));
}

function variantRecords(model: PosterModel | null | undefined): JsonRecord[] {
  try { return list(record(JSON.parse(textOf(model?.files?.["src/variants/manifest.json"]))).variants).map(record); }
  catch { return []; }
}

function finalOutputPaths(model: PosterModel | null | undefined): string[] {
  return variantRecords(model).flatMap((variant) => [
    `dist/${model?.artifactId}.${String(variant.id)}.svg`,
    `dist/${model?.artifactId}.${String(variant.id)}.png`,
  ]);
}

function receiptOutputPaths(model: PosterModel | null | undefined): string[] {
  return [
    ...finalOutputPaths(model),
    ...Object.keys(model?.files ?? {}).filter((path) => /^evidence\/layers\/.+\.(?:png|svg)$/u.test(path)).sort(),
    "evidence.render.json", "evidence.probe.json", "evidence.accessibility.json", "review.poster.json", "release.manifest.json",
  ];
}

export function createPosterReleaseManifest(model: PosterModel | null | undefined) {
  return {
    schema: RELEASE_MANIFEST_SCHEMA,
    plugin: "poster-project-delivery-guard",
    artifactId: model?.artifactId,
    subjectDigest: computePosterSubjectDigest(model),
    variants: variantRecords(model).map((variant) => ({
      id: variant.id,
      width: variant.width,
      height: variant.height,
      svg: `dist/${model?.artifactId}.${String(variant.id)}.svg`,
      svgSha256: digestOf(model, `dist/${model?.artifactId}.${String(variant.id)}.svg`),
      png: `dist/${model?.artifactId}.${String(variant.id)}.png`,
      pngSha256: digestOf(model, `dist/${model?.artifactId}.${String(variant.id)}.png`),
    })),
  };
}

export function createPosterReceipt(model: PosterModel | null | undefined): PosterReceipt {
  return {
    schemaVersion: 2,
    plugin: "poster-project-delivery-guard",
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest: computePosterSubjectDigest(model),
    outputs: Object.fromEntries(receiptOutputPaths(model).map((path) => [path, digestOf(model, path)])),
  };
}

export function validatePosterReceipt(model: PosterModel | null | undefined): boolean {
  try {
    const actual = record(JSON.parse(textOf(model?.files?.["receipt.release.json"])));
    const expected = createPosterReceipt(model);
    return actual.schemaVersion === expected.schemaVersion && actual.plugin === expected.plugin && actual.artifactId === expected.artifactId && actual.stage === expected.stage && actual.subjectDigest === expected.subjectDigest && JSON.stringify(actual.outputs) === JSON.stringify(expected.outputs);
  } catch { return false; }
}

function validateBase(model: PosterModel | null | undefined, findings: ContractFinding[]) {
  const files = model?.files ?? {};
  for (const path of REQUIRED_SOURCE_FILES) if (!(path in files)) findings.push(finding("REQUIRED_PATH_MISSING", path, `${path} is required`));
  if (".poster-delivery-journal.json" in files) findings.push(finding("MUTATION_JOURNAL_OPEN", ".poster-delivery-journal.json", "an interrupted writer must be recovered"));
  const plan = record(parseJson(files, "plan.contract.json", findings));
  const profile = String(plan.profile ?? "");
  if (plan.schema !== PLAN_SCHEMA || plan.artifactId !== model?.artifactId || !PROFILE_SET.has(profile) || !STAGE_SET.has(String(plan.targetStage)) || typeof plan.audience !== "string" || !plan.audience.trim() || typeof plan.objective !== "string" || !plan.objective.trim() || typeof plan.language !== "string") findings.push(finding("PLAN_INVALID", "plan.contract.json", "plan must bind schema, artifact, profile, stage, audience, objective, and language"));
  const art = record(parseJson(files, "plan.art-direction.json", findings));
  if (art.schema !== ART_DIRECTION_SCHEMA || art.profile !== profile || ["concept", "visualCenter", "hierarchy", "typographyStrategy", "colorRationale"].some((key) => typeof art[key] !== "string" || !String(art[key]).trim() || /TODO/u.test(String(art[key])))) findings.push(finding("ART_DIRECTION_INVALID", "plan.art-direction.json", "art direction must be complete and profile-bound"));
  const skills = record(parseJson(files, "plan.skill-composition.json", findings));
  const workers = list(skills.workers).map(record);
  const workerMap = new Map(workers.map((worker) => [String(worker.name), worker]));
  if (skills.schema !== SKILL_COMPOSITION_SCHEMA || workers.length !== REQUIRED_ADVISORS.size || [...REQUIRED_ADVISORS].some(([name, revision]) => workerMap.get(name)?.revision !== revision || !["used", "skipped", "unavailable"].includes(String(workerMap.get(name)?.status)))) findings.push(finding("SKILL_COMPOSITION_INVALID", "plan.skill-composition.json", "the four exact pinned advisors with truthful statuses are required"));
  const assets = record(parseJson(files, "plan.assets.json", findings));
  const entries = list(assets.assets).map(record);
  if (assets.schema !== ASSET_MANIFEST_SCHEMA || entries.some((asset) => typeof asset.path !== "string" || typeof asset.role !== "string" || !asset.role.trim() || !/^[a-f0-9]{64}$/u.test(String(asset.sha256)) || !["project", "user", "generated", "licensed", "public-domain"].includes(String(asset.sourceType)) || !(String(asset.path) in files) || digestOf(model, String(asset.path)) !== asset.sha256 || (asset.sourceType === "generated" && (!asset.tool || !asset.model || !/^[a-f0-9]{64}$/u.test(String(asset.promptDigest)))) || (["licensed", "public-domain"].includes(String(asset.sourceType)) && (!/^https?:\/\//u.test(String(asset.sourceUrl)) || typeof asset.rightsStatus !== "string" || !asset.rightsStatus.trim())))) findings.push(finding("ASSET_MANIFEST_INVALID", "plan.assets.json", "assets must be local, digest-bound, role-bound, and provenance-complete"));
  const design = record(parseJson(files, "design.system.json", findings));
  const colors = record(design.colors);
  const typography = record(design.typography);
  const contrastPairs = list(design.contrastPairs).map(record);
  if (design.schema !== DESIGN_SYSTEM_SCHEMA || Object.keys(colors).length < 2 || Object.values(colors).some((color) => !/^[a-f0-9]{6}$/iu.test(String(color))) || Object.keys(typography).length === 0 || Object.values(typography).map(record).some((role) => typeof role.family !== "string" || !role.family.trim() || !Number.isInteger(role.sizePx) || Number(role.sizePx) <= 0 || !Number.isInteger(role.weight)) || !isObject(design.spacing) || contrastPairs.length === 0 || contrastPairs.some((pair) => !(String(pair.foreground) in colors) || !(String(pair.background) in colors) || !Number.isFinite(pair.minimum) || Number(pair.minimum) < 1)) findings.push(finding("DESIGN_SYSTEM_INVALID", "design.system.json", "semantic colors, typed roles, spacing, and valid contrast pairs are required"));
  const project = record(parseJson(files, "poster.project.json", findings));
  if (project.schema !== PROJECT_SCHEMA || project.artifactId !== model?.artifactId || project.profile !== profile || project.entry !== "src/render.ts" || project.variantManifest !== "src/variants/manifest.json") findings.push(finding("PROJECT_INVALID", "poster.project.json", "project must bind artifact, profile, entry, and variant manifest"));
}

function validateVariants(model: PosterModel | null | undefined, stage: PosterStage, findings: ContractFinding[]) {
  const files = model?.files ?? {};
  const manifest = record(parseJson(files, "src/variants/manifest.json", findings));
  const variants = list(manifest.variants).map(record);
  if (manifest.schema !== VARIANT_MANIFEST_SCHEMA || variants.length === 0) findings.push(finding("VARIANT_MANIFEST_INVALID", "src/variants/manifest.json", "at least one v2 variant is required"));
  const seen = new Set<string>();
  for (const [offset, variant] of variants.entries()) {
    const directory = String(variant.directory ?? "");
    const id = String(variant.id ?? "");
    const match = directory.match(VARIANT_DIRECTORY);
    const width = Number(variant.width);
    const height = Number(variant.height);
    if (!match || variant.index !== offset + 1 || Number(match.groups?.index) !== variant.index || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) || seen.has(id) || !Number.isInteger(width) || !Number.isInteger(height) || width < 320 || height < 320 || width > 8192 || height > 8192) {
      findings.push(finding("VARIANT_INVALID", "src/variants/manifest.json", "variants must have unique ids, contiguous directories, and bounded integer dimensions"));
      continue;
    }
    seen.add(id);
    const variantPath = `src/variants/${directory}/variant.json`;
    const variantConfig = record(parseJson(files, variantPath, findings));
    if (variantConfig.schema !== "poster-project-delivery-guard/variant/v2" || variantConfig.id !== id || variantConfig.width !== width || variantConfig.height !== height || variantConfig.data !== `data/${id}.json`) findings.push(finding("VARIANT_CONFIG_INVALID", variantPath, "variant config must match the manifest and data path"));
    parseJson(files, `data/${id}.json`, findings);
    const layersPath = `src/variants/${directory}/layers/manifest.json`;
    const layerManifest = record(parseJson(files, layersPath, findings));
    const layers = list(layerManifest.layers).map(record);
    if (layerManifest.schema !== LAYER_MANIFEST_SCHEMA || layers.length === 0 || record(layers[0]).role !== "background") findings.push(finding("LAYER_MANIFEST_INVALID", layersPath, "a v2 manifest beginning with background is required"));
    for (const [layerOffset, layer] of layers.entries()) {
      const source = String(layer.source ?? "");
      const sourcePath = `src/variants/${directory}/layers/${source}`;
      const sourceMatch = source.match(LAYER_SOURCE);
      if (!sourceMatch || layer.index !== layerOffset + 1 || sourceMatch.groups?.role !== layer.role || !(sourcePath in files)) { findings.push(finding("LAYER_INVALID", sourcePath, "layer filename, role, order, and source must agree")); continue; }
      const sourceText = textOf(files[sourcePath]);
      if (OWNER_VIOLATION.test(sourceText) || (sourceText.match(/export\s+(?:async\s+)?function\s+buildLayer\s*\(/gu) ?? []).length !== 1 || /from\s+["']\.\/[0-9]{3}-[^"']+["']/u.test(sourceText)) findings.push(finding("LAYER_OWNER_VIOLATION", sourcePath, "layer must be a deterministic isolated buildLayer module"));
      if (stageAtLeast(stage, "render")) {
        const base = `evidence/layers/${id}/${source.slice(0, -4)}.${digestOf(model, sourcePath)}`;
        for (const extension of ["svg", "png"] as const) {
          const proofPath = `${base}.${extension}`;
          if (!(proofPath in files)) findings.push(finding("LAYER_PROOF_MISSING", proofPath, "current source-hash proof is required"));
          else try {
            if (extension === "svg") inspectPosterSvg(rawBytes(model, proofPath));
            else inspectPosterPng(rawBytes(model, proofPath));
          }
          catch (error) { findings.push(finding("LAYER_PROOF_INVALID", proofPath, error instanceof Error ? error.message : String(error))); }
        }
      }
    }
    if (stageAtLeast(stage, "render")) {
      for (const extension of ["svg", "png"] as const) {
        const output = `dist/${model?.artifactId}.${id}.${extension}`;
        if (!(output in files)) { findings.push(finding("RENDER_OUTPUT_MISSING", output, "final SVG and PNG are required")); continue; }
        try {
          const inspection = extension === "svg" ? inspectPosterSvg(rawBytes(model, output)) : inspectPosterPng(rawBytes(model, output));
          if (inspection.width !== width || inspection.height !== height) findings.push(finding("RENDER_DIMENSION_MISMATCH", output, "output dimensions must match the variant"));
        } catch (error) { findings.push(finding("RENDER_OUTPUT_INVALID", output, error instanceof Error ? error.message : String(error))); }
      }
    }
  }
}

function readEvidence(model: PosterModel | null | undefined, path: string): JsonRecord {
  try { return record(JSON.parse(textOf(model?.files?.[path]))); }
  catch { return {}; }
}

function evidenceHeaderCurrent(model: PosterModel | null | undefined, evidence: JsonRecord, schema: string): boolean {
  return evidence.schema === schema && evidence.plugin === "poster-project-delivery-guard" && evidence.artifactId === model?.artifactId && evidence.subjectDigest === computePosterSubjectDigest(model) && evidence.verdict === "pass";
}

function expectedRenderPaths(model: PosterModel | null | undefined): string[] {
  return [
    ...finalOutputPaths(model),
    ...Object.keys(model?.files ?? {}).filter((path) => /^evidence\/layers\/.+\.(?:svg|png)$/u.test(path)),
  ].sort();
}

function renderEvidenceCurrent(model: PosterModel | null | undefined): boolean {
  const evidence = readEvidence(model, "evidence.render.json");
  const outputs = list(evidence.outputs).map(record);
  const expected = expectedRenderPaths(model);
  return evidenceHeaderCurrent(model, evidence, RENDER_EVIDENCE_SCHEMA)
    && isObject(evidence.renderer)
    && typeof record(evidence.renderer).satori === "string"
    && typeof record(evidence.renderer).resvg === "string"
    && outputs.length === expected.length
    && outputs.every((output, index) => output.path === expected[index] && output.sha256 === digestOf(model, expected[index] ?? ""));
}

function probeEvidenceCurrent(model: PosterModel | null | undefined): boolean {
  const evidence = readEvidence(model, "evidence.probe.json");
  const measurements = list(evidence.measurements).map(record);
  const variants = variantRecords(model);
  const checks = list(evidence.checks).map(record);
  return evidenceHeaderCurrent(model, evidence, PROBE_EVIDENCE_SCHEMA)
    && measurements.length === variants.length
    && measurements.every((measurement, index) => {
      const variant = variants[index] ?? {};
      const id = String(variant.id);
      const svgPath = `dist/${model?.artifactId}.${id}.svg`;
      const pngPath = `dist/${model?.artifactId}.${id}.png`;
      const svg = record(measurement.svg);
      const png = record(measurement.png);
      return measurement.id === id
        && svg.width === variant.width && svg.height === variant.height
        && png.width === variant.width && png.height === variant.height && Number(png.alphaCoverage) >= 0.01
        && measurement.svgSha256 === digestOf(model, svgPath)
        && measurement.pngSha256 === digestOf(model, pngPath)
        && measurement.independentRasterSha256 === digestOf(model, pngPath);
    })
    && ["svg-png-byte-equivalence", "bounded-nonblank-raster"].every((criterion) => checks.some((check) => check.criterion === criterion && check.status === "pass"));
}

function accessibilityEvidenceCurrent(model: PosterModel | null | undefined): boolean {
  const evidence = readEvidence(model, "evidence.accessibility.json");
  const checks = list(evidence.checks).map(record);
  const design = readEvidence(model, "design.system.json");
  const pairs = list(design.contrastPairs).map(record);
  const typographyRoles = Object.keys(record(design.typography));
  return evidenceHeaderCurrent(model, evidence, ACCESSIBILITY_EVIDENCE_SCHEMA)
    && evidence.nonColorEncoding === true
    && checks.length >= pairs.length + typographyRoles.length
    && checks.every((check) => check.status === "pass")
    && pairs.every((pair) => checks.some((check) => check.criterion === `contrast:${String(pair.foreground)}:${String(pair.background)}` && Number(check.value) >= Number(pair.minimum)))
    && typographyRoles.every((role) => checks.some((check) => check.role === role && check.status === "pass"));
}

function reviewEvidenceCurrent(model: PosterModel | null | undefined): boolean {
  const evidence = readEvidence(model, "review.poster.json");
  const variants = variantRecords(model);
  const reviewed = list(evidence.variants).map(record);
  const checks = record(evidence.checks);
  const reviewFindings = list(evidence.findings).map(record);
  return evidenceHeaderCurrent(model, evidence, REVIEW_SCHEMA)
    && reviewed.length === variants.length
    && reviewed.every((variant, index) => variant.id === variants[index]?.id && variant.verdict === "pass" && variant.pngSha256 === digestOf(model, `dist/${model?.artifactId}.${String(variant.id)}.png`))
    && REVIEW_CHECKS.every((key) => checks[key] === "pass")
    && reviewFindings.every((entry) => ["low", "medium", "high", "critical"].includes(String(entry.severity)) && typeof entry.anchor === "string" && entry.anchor.trim() && typeof entry.evidence === "string" && entry.evidence.trim() && typeof entry.recovery === "string" && entry.recovery.trim() && ["resolved", "accepted"].includes(String(entry.disposition)));
}

export function validatePosterModel(model: PosterModel | null | undefined, { stage = "source" }: PosterValidateOptions = {}): ContractFinding[] {
  if (typeof stage !== "string" || !STAGE_SET.has(stage)) return [finding("STAGE_INVALID", "plan.contract.json", `unsupported poster stage: ${String(stage)}`)];
  const typedStage = stage as PosterStage;
  const findings: ContractFinding[] = [];
  validateBase(model, findings);
  validateVariants(model, typedStage, findings);
  if (stageAtLeast(typedStage, "render") && !renderEvidenceCurrent(model)) findings.push(finding("RENDER_EVIDENCE_INVALID", "evidence.render.json", "render evidence must bind every current output digest and renderer"));
  if (stageAtLeast(typedStage, "probe")) {
    if (!probeEvidenceCurrent(model)) findings.push(finding("PROBE_EVIDENCE_INVALID", "evidence.probe.json", "probe evidence must bind dimensions, decoded raster coverage, and independently reproduced output digests"));
    if (!accessibilityEvidenceCurrent(model)) findings.push(finding("ACCESSIBILITY_EVIDENCE_INVALID", "evidence.accessibility.json", "accessibility evidence must bind all current contrast, typography, and non-color checks"));
  }
  if (stageAtLeast(typedStage, "review")) {
    if (!reviewEvidenceCurrent(model)) findings.push(finding("REVIEW_INVALID", "review.poster.json", "independent passing review must cover every current variant and required visual check"));
    else {
      const review = record(JSON.parse(textOf(model?.files?.["review.poster.json"])));
      const reviewer = record(review.reviewer);
      const renderSession = record(readEvidence(model, "evidence.render.json")).sessionId;
      if (!["human", "independent-agent"].includes(String(reviewer.kind)) || typeof reviewer.id !== "string" || !reviewer.id || typeof reviewer.sessionId !== "string" || !reviewer.sessionId || reviewer.sessionId === renderSession || reviewer.sessionId === (process.env.AI_EXPERTS_SESSION_ID || "unknown")) findings.push(finding("REVIEW_SELF", "review.poster.json", "reviewer identity and session must be independent from rendering and the current session"));
    }
  }
  if (stageAtLeast(typedStage, "release")) {
    try { if (JSON.stringify(record(JSON.parse(textOf(model?.files?.["release.manifest.json"])))) !== JSON.stringify(createPosterReleaseManifest(model))) findings.push(finding("RELEASE_MANIFEST_INVALID", "release.manifest.json", "release manifest must map current SVG and PNG outputs")); }
    catch { findings.push(finding("RELEASE_MANIFEST_INVALID", "release.manifest.json", "release manifest is required")); }
    if (!("receipt.release.json" in (model?.files ?? {}))) findings.push(finding("RELEASE_PATH_MISSING", "receipt.release.json", "release receipt is required"));
    else if (!validatePosterReceipt(model)) findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "receipt must bind current source and all delivery bytes"));
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}

export function resolveWorkspaceRoot(cwd: string): string {
  let current = resolve(cwd);
  while (current !== dirname(current)) {
    if (basename(dirname(current)) === "poster" && basename(dirname(dirname(current))) === "artifacts") return dirname(dirname(dirname(current)));
    current = dirname(current);
  }
  return resolve(cwd);
}

export function isPosterProjectRoot(root: string, workspaceRoot: string): boolean {
  return dirname(resolve(root)) === resolve(workspaceRoot, "artifacts", "poster") && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root));
}

export async function findPosterProjects(cwd: string): Promise<string[]> {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const carrier = join(workspaceRoot, "artifacts", "poster");
  try {
    const entries = await readdir(carrier, { withFileTypes: true });
    if (entries.length > 128) throw new Error("PROJECT_COUNT_LIMIT_EXCEEDED");
    return entries.filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name)).map((entry) => join(carrier, entry.name)).sort();
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function collectProject(root: string, directory: string, model: Required<Pick<PosterModel, "files" | "bytes" | "digests">>, counter: { files: number; bytes: number }): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await collectProject(root, absolute, model, counter);
    else if (entry.isFile()) {
      if (++counter.files > 2048) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
      const bytes = await readFile(absolute);
      counter.bytes += bytes.byteLength;
      if (bytes.byteLength > 32 * 1024 * 1024 || counter.bytes > 256 * 1024 * 1024) throw new Error("PROJECT_SIZE_LIMIT_EXCEEDED");
      const path = relative(root, absolute).replaceAll("\\", "/");
      model.bytes[path] = bytes;
      model.digests[path] = sha256(bytes);
      model.files[path] = /\.(?:png|woff|woff2|ttf|otf)$/iu.test(path) ? bytes : bytes.toString("utf8");
    }
  }
}

export async function loadPosterProject(root: string): Promise<PosterModel> {
  const model = { files: {} as FileMap, bytes: {} as BytesMap, digests: {} as DigestMap };
  await collectProject(root, root, model, { files: 0, bytes: 0 });
  const parse = (path: string) => { try { return JSON.parse(textOf(model.files[path])); } catch { return null; } };
  return { root, artifactId: basename(root), ...model, plan: parse("plan.contract.json"), project: parse("poster.project.json") };
}

function posterProjectInside(relativePath = "", cwd = ""): string {
  const normalized = relativePath.replaceAll("\\", "/");
  const absolute = resolve(cwd || ".", relativePath).replaceAll("\\", "/");
  for (const candidate of [normalized, absolute]) {
    const match = candidate.match(/(?:^|\/)artifacts\/poster\/[^/]+\/(?<inside>.+)$/u);
    if (match?.groups?.inside) return match.groups.inside;
  }
  return "";
}

export function evaluatePosterWrite({ relativePath = "", toolName = "", writer = "", cwd = "" }: PosterWriteOptions = {}): PosterWriteDecision {
  const inside = posterProjectInside(relativePath, cwd);
  if (!inside) return { decision: "allow" };
  if ((GENERATED_PATH.test(inside) || SOURCE_PROOF_PATH.test(inside)) && !writer.startsWith("poster-")) return { decision: "deny", code: "PROTECTED_WRITER_REQUIRED", message: `${inside} must be written by a registered poster writer, not ${toolName || "an unregistered tool"}` };
  return { decision: "allow" };
}
