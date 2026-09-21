// harness-source-hash: sha256:5a69b2936e6051b23a45a0fe4c95ae9b70fc60d9e4a2f87fcad9fc09c2802d4a
import {
  unzipSync
} from "./chunk-X2YRUGE2.mjs";
import {
  require_lib
} from "./chunk-V2UVYWCZ.mjs";
import {
  communicationAnchors,
  communicationCoreValid,
  communicationReviewValid
} from "./chunk-6TTQXZBL.mjs";
import {
  __toESM
} from "./chunk-2VFKL446.mjs";

// plugins/artifact-production/src/domains/presentation/lib/contract.ts
var import_xmldom = __toESM(require_lib(), 1);
import { createHash } from "node:crypto";
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
  sep
} from "node:path";
import { TextDecoder } from "node:util";
var PLAN_SCHEMA = "presentation-production/plan/v4";
var STORYBOARD_SCHEMA = "presentation-production/storyboard/v4";
var SKILL_COMPOSITION_SCHEMA = "presentation-production/skill-composition/v4";
var DESIGN_SYSTEM_SCHEMA = "presentation-production/design-system/v4";
var PROJECT_SCHEMA = "presentation-production/project/v4";
var SLIDE_MANIFEST_SCHEMA = "presentation-production/slide-manifest/v4";
var RENDER_EVIDENCE_SCHEMA = "presentation-production/render-evidence/v4";
var STRUCTURE_EVIDENCE_SCHEMA = "presentation-production/structure-evidence/v4";
var DESIGN_EVIDENCE_SCHEMA = "presentation-production/design-evidence/v4";
var ACCESSIBILITY_EVIDENCE_SCHEMA = "presentation-production/accessibility-evidence/v4";
var REVIEW_INPUT_SCHEMA = "presentation-production/review-input/v4";
var REVIEW_SCHEMA = "presentation-production/review/v4";
var RELEASE_MANIFEST_SCHEMA = "presentation-production/release-manifest/v4";
var RECEIPT_SCHEMA = "presentation-production/receipt/v4";
var STAGES = /* @__PURE__ */ new Set([
  "source",
  "design",
  "render",
  "probe",
  "review",
  "release"
]);
var STAGE_RANK = {
  source: 0,
  design: 1,
  render: 2,
  probe: 3,
  review: 4,
  release: 5
};
var SLIDE_SOURCE = /^(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.ts$/u;
var GENERATED_PATH = /^(?:dist\/|evidence\.[^/]+\.json$|review\.[^/]+\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$)/u;
var SLIDE_OWNER_VIOLATION = /(?:\baddSlide\s*\(|\bnew\s+pptxgen\b|from\s+["']pptxgenjs["']|\b(?:writeFile|writeFileSync|createWriteStream|fetch|setTimeout|setInterval)\s*\(|\b(?:Date\.now|Math\.random)\s*\(|from\s+["']node:(?:fs|child_process)["'])/u;
function hasUnsafeSvgReference(text) {
  if (/<\s*(?:script|foreignObject|iframe|object|embed)\b|\bon\w+\s*=|@import\b/iu.test(text)) return true;
  for (const match of text.matchAll(/(?:href|src)\s*=\s*["']([^"']*)["']/giu)) {
    if (!/^(?:#|data:image\/(?:png|jpeg|gif|webp);base64,)/iu.test(match[1] ?? "")) return true;
  }
  for (const match of text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/giu)) {
    if (!/^(?:#|data:(?:image|font)\/)/iu.test(match[1] ?? "")) return true;
  }
  return false;
}
var TEXT_EXTENSIONS = /* @__PURE__ */ new Set([
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
  ".yml"
]);
var TEXT_BASENAMES = /* @__PURE__ */ new Set([".gitignore", "LICENSE"]);
var SKIPPED_DIRECTORIES = /* @__PURE__ */ new Set(["node_modules", ".git", ".cache", ".tmp"]);
var UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
var PNG_SIGNATURE = Buffer.from([
  137,
  80,
  78,
  71,
  13,
  10,
  26,
  10
]);
var SLIDE_WIDTH_IN = 13.333;
var SLIDE_HEIGHT_IN = 7.5;
var EMU_PER_INCH = 914400;
var DISPLAY_TITLE_MAX_WIDTH = 20;
var ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
var VISUAL_TYPES = /* @__PURE__ */ new Set([
  "hero",
  "content",
  "comparison",
  "diagram",
  "data",
  "media",
  "closing"
]);
var RELATION_KINDS = /* @__PURE__ */ new Set([
  "flow",
  "dependency",
  "association",
  "disconnect"
]);
var REVIEW_CHECKS = [
  "audienceBoundary",
  "headlineEconomy",
  "visualPayload",
  "layoutRhythm",
  "relationshipSemantics"
];
var digest = (value) => createHash("sha256").update(value).digest("hex");
var isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var rec = (value) => isObject(value) ? value : void 0;
var list = (value) => Array.isArray(value) ? value : [];
var bytesOf = (value) => Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : "");
var finding = (code, path, message) => ({ code, path, message });
var stageAtLeast = (stage, expected) => STAGE_RANK[stage] >= STAGE_RANK[expected];
function displayWidth(value) {
  let width = 0;
  for (const character of value) {
    width += /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}]/u.test(character) ? 2 : 1;
  }
  return width;
}
function validDisplayTitle(value) {
  return typeof value === "string" && value === value.trim() && value.length > 0 && !/[\r\n]/u.test(value) && displayWidth(value) <= DISPLAY_TITLE_MAX_WIDTH;
}
function parseJson(files, filePath, findings) {
  const value = files[filePath];
  if (typeof value !== "string") {
    findings?.push(
      finding(
        "REQUIRED_PATH_MISSING",
        filePath,
        `${filePath} is required and must be UTF-8 JSON`
      )
    );
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    findings?.push(
      finding("JSON_INVALID", filePath, `${filePath} must contain valid JSON`)
    );
    return null;
  }
}
function schemaRecord(files, filePath, schema, code, findings) {
  const value = parseJson(files, filePath, findings);
  const record = rec(value);
  if (value !== null && (!record || record.schema !== schema))
    findings.push(
      finding(code, filePath, `${filePath} must use schema ${schema}`)
    );
  return record;
}
function sourceDigestRecord(model, record) {
  return Boolean(record) && record?.artifactId === model.artifactId && record?.subjectDigest === computePptxSubjectDigest(model);
}
function isGeneratedSubjectPath(filePath) {
  return filePath === ".pptx-delivery-journal.json" || GENERATED_PATH.test(filePath) || filePath.startsWith("src/slides/") && filePath.endsWith(".png");
}
function fileDigest(model, filePath) {
  return model?.digests?.[filePath] ?? digest(bytesOf(model?.files?.[filePath]));
}
function computePptxSubjectDigest(model) {
  const records = Object.keys(model?.files ?? {}).filter((filePath) => !isGeneratedSubjectPath(filePath)).sort().map((filePath) => `${filePath}\0${fileDigest(model, filePath)}
`).join("");
  return digest(records);
}
function releaseOutputPaths(model) {
  return Object.keys(model?.files ?? {}).filter(
    (filePath) => GENERATED_PATH.test(filePath) || filePath.startsWith("src/slides/") && filePath.endsWith(".png")
  ).filter((filePath) => filePath !== "receipt.release.json").sort();
}
function createPptxReceipt(model, stage = "release") {
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
        fileDigest(model, filePath)
      ])
    )
  };
}
function validatePptxReceipt(model, stage = "release") {
  if (stage !== "release") return false;
  const text = model?.files?.[`receipt.${stage}.json`];
  if (typeof text !== "string") return false;
  let receipt;
  try {
    receipt = JSON.parse(text);
  } catch {
    return false;
  }
  const expected = createPptxReceipt(model ?? {}, stage);
  const record = rec(receipt);
  return Boolean(record) && record?.schema === expected.schema && record.plugin === expected.plugin && record.artifactId === expected.artifactId && record.stage === expected.stage && record.subjectDigest === expected.subjectDigest && JSON.stringify(record.outputs) === JSON.stringify(expected.outputs);
}
function validateRequiredSource(files, findings) {
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
    "src/theme.ts",
    "src/slides/manifest.json"
  ])
    if (!(filePath in files))
      findings.push(
        finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`)
      );
}
function validateGitignore(files, findings) {
  const text = files[".gitignore"];
  if (typeof text !== "string") return;
  text.split(/\r?\n/u).forEach((raw, offset) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) return;
    const normalized = line.replace(/^\//u, "");
    if (/^(?:dist|build|evidence)(?:\/|$)/u.test(normalized) || /^(?:receipt|review|release)(?:\.|\/|$)/u.test(normalized) || /^(?:\*\*\/)?\*\.(?:png|svg|pdf|pptx)$/u.test(normalized)) {
      findings.push(
        finding(
          "DELIVERY_PATH_IGNORED",
          `.gitignore:${offset + 1}`,
          `artifact delivery path must not be ignored: ${line}`
        )
      );
    }
  });
}
function validateDesignSystem(record, findings) {
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
    "error"
  ];
  if (!roles || !requiredColors.every(
    (key) => typeof roles[key] === "string" && /^[A-Fa-f0-9]{6}$/u.test(String(roles[key]))
  ))
    findings.push(
      finding(
        "DESIGN_SYSTEM_INVALID",
        "design.system.json",
        "semantic color roles must be six-digit sRGB hex values without #"
      )
    );
  if (!typeRoles || !["display", "title", "section", "body", "caption", "numeric"].every(
    (key) => {
      const role = rec(typeRoles[key]);
      return role && typeof role.fontFamily === "string" && role.fontFamily.trim().length > 0 && Number(role.fontSizePt) > 0 && Number(role.lineSpacingMultiple) >= 1 && Number(role.lineSpacingMultiple) <= 2 && Number.isFinite(role.charSpacingPt) && Number(role.charSpacingPt) >= -1 && Number(role.charSpacingPt) <= 10 && Number.isInteger(role.maxLines) && Number(role.maxLines) > 0 && ["cjk", "latin", "mixed"].includes(String(role.scriptPolicy));
    }
  ))
    findings.push(
      finding(
        "DESIGN_SYSTEM_INVALID",
        "design.system.json",
        "typography roles must declare family, point size, line spacing, character spacing, line limit, and script policy"
      )
    );
  if (!spacing || Number(spacing.pageMarginIn) < 0.3 || Number(spacing.baseUnitIn) <= 0 || Number(spacing.blockGapIn) <= 0 || Number(spacing.paragraphGapIn) <= 0)
    findings.push(
      finding(
        "DESIGN_SYSTEM_INVALID",
        "design.system.json",
        "spacing must declare pageMarginIn >= 0.3 and positive baseUnitIn, blockGapIn, and paragraphGapIn"
      )
    );
}
function validAudience(value) {
  const audience = rec(value);
  if (!audience || !["primary", "context", "desiredAction"].every(
    (key) => typeof audience[key] === "string" && Boolean(String(audience[key]).trim())
  ) || !["implicit", "explicit"].includes(String(audience.addressing)))
    return false;
  return audience.addressing !== "explicit" || typeof audience.explicitRationale === "string" && Boolean(audience.explicitRationale.trim());
}
function validateSlideVisual(files, slide, index, findings) {
  const visual = rec(slide?.visual);
  const path = `plan.storyboard.json#slides/${index}/visual`;
  if (!visual || !VISUAL_TYPES.has(String(visual.type)) || visual.variant !== void 0 && (typeof visual.variant !== "string" || !visual.variant.trim())) {
    findings.push(
      finding(
        "STORYBOARD_VISUAL_INVALID",
        path,
        "visual must use a supported type and an optional non-empty variant"
      )
    );
    return;
  }
  if (visual.type !== "diagram") return;
  if (visual.mode === "svg") {
    const assetPath = typeof visual.asset === "string" ? visual.asset : path;
    if (typeof visual.asset !== "string" || !/^assets\/diagrams\/[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/u.test(
      visual.asset
    ) || !/^[a-f0-9]{64}$/u.test(String(visual.sha256 ?? "")) || !["contain", "cover"].includes(String(visual.fit)) || typeof visual.takeaway !== "string" || !visual.takeaway.trim() || typeof visual.alt !== "string" || !visual.alt.trim()) {
      findings.push(
        finding(
          "DIAGRAM_ASSET_INVALID",
          assetPath,
          "SVG diagram slides require a local asset, SHA-256, fit, takeaway, and alt text"
        )
      );
      return;
    }
    const asset = files[visual.asset];
    if (typeof asset !== "string" || digest(Buffer.from(asset)) !== visual.sha256) {
      findings.push(
        finding(
          "DIAGRAM_ASSET_INVALID",
          visual.asset,
          "diagram SVG must exist and match the declared SHA-256"
        )
      );
      return;
    }
    if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/iu.test(asset) || hasUnsafeSvgReference(asset))
      findings.push(
        finding(
          "DIAGRAM_ASSET_UNSAFE",
          visual.asset,
          "diagram SVG must be self-contained and contain no executable or external content"
        )
      );
    return;
  }
  if (visual.mode !== "native") {
    findings.push(
      finding(
        "DIAGRAM_MODE_INVALID",
        path,
        "diagram visuals must declare svg or native mode"
      )
    );
    return;
  }
  const nodes = list(visual.nodes).map(rec);
  const relations = list(visual.relations).map(rec);
  const nodeIds = /* @__PURE__ */ new Set();
  const nodesValid = nodes.length >= 2 && nodes.every((node) => {
    const id = String(node?.id ?? "");
    const valid = Boolean(node) && ID.test(id) && !nodeIds.has(id) && typeof node?.role === "string" && Boolean(node.role.trim());
    nodeIds.add(id);
    return valid;
  });
  const relationIds = /* @__PURE__ */ new Set();
  const relationsValid = relations.length > 0 && relations.every((relation) => {
    const id = String(relation?.id ?? "");
    const kind = String(relation?.kind ?? "");
    const segmentCount = relation?.segmentCount ?? 1;
    const valid = Boolean(relation) && ID.test(id) && !relationIds.has(id) && nodeIds.has(String(relation?.from ?? "")) && nodeIds.has(String(relation?.to ?? "")) && relation?.from !== relation?.to && RELATION_KINDS.has(kind) && (kind === "disconnect" || Number.isInteger(segmentCount) && Number(segmentCount) >= 1 && Number(segmentCount) <= 8);
    relationIds.add(id);
    return valid;
  });
  if (!nodesValid || !relationsValid)
    findings.push(
      finding(
        "NATIVE_DIAGRAM_INVALID",
        path,
        "native diagrams require unique nodes and typed, node-bound relations"
      )
    );
}
function validateSourceSchemas(model, files, findings) {
  const plan = schemaRecord(
    files,
    "plan.contract.json",
    PLAN_SCHEMA,
    "PLAN_INVALID",
    findings
  );
  if (plan && (plan.artifactId !== model.artifactId || !STAGES.has(plan.targetStage) || !validAudience(plan.audience) || typeof plan.objective !== "string" || typeof plan.language !== "string"))
    findings.push(
      finding(
        "PLAN_INVALID",
        "plan.contract.json",
        "plan must bind artifactId, targetStage, structured audience intent, objective, and language"
      )
    );
  const storyboard = schemaRecord(
    files,
    "plan.storyboard.json",
    STORYBOARD_SCHEMA,
    "STORYBOARD_INVALID",
    findings
  );
  const storyboardSlides = list(storyboard?.slides);
  if (!communicationCoreValid(plan?.communicationCore)) findings.push(finding("COMMUNICATION_CORE_INVALID", "plan.contract.json", "presentation plan must bind a complete communicationCore"));
  else {
    const allowed = new Set(storyboardSlides.map((entry) => `slide:${String(rec(entry)?.id ?? "")}`));
    if (communicationAnchors(plan?.communicationCore).some((anchor) => !allowed.has(anchor))) findings.push(finding("COMMUNICATION_CUE_UNBOUND", "plan.contract.json", "every presentation signature cue anchor must reference a storyboard slide"));
  }
  if (storyboard && (!storyboardSlides.length || !storyboardSlides.every(
    (entry, index) => rec(entry)?.index === index + 1 && typeof rec(entry)?.id === "string" && validDisplayTitle(rec(entry)?.displayTitle) && typeof rec(entry)?.role === "string" && isObject(rec(entry)?.visual) && typeof rec(entry)?.assertion === "string" && Boolean(String(rec(entry)?.assertion).trim()) && typeof rec(entry)?.narrativeJob === "string" && Boolean(String(rec(entry)?.narrativeJob).trim()) && typeof rec(entry)?.transition === "string" && Boolean(String(rec(entry)?.transition).trim())
  )))
    findings.push(
      finding(
        "STORYBOARD_INVALID",
        "plan.storyboard.json",
        "storyboard slides must be contiguous and declare id, compact displayTitle, role, and visual"
      )
    );
  for (const [index, entry] of storyboardSlides.entries()) {
    const slide = rec(entry);
    if (slide && !validDisplayTitle(slide.displayTitle))
      findings.push(
        finding(
          "DISPLAY_TITLE_INVALID",
          `plan.storyboard.json#slides/${index}/displayTitle`,
          `displayTitle must be one line and at most ${DISPLAY_TITLE_MAX_WIDTH} display-width units`
        )
      );
    validateSlideVisual(files, slide, index, findings);
  }
  if (storyboard && storyboardSlides.some((entry) => typeof rec(entry)?.coreContribution !== "string" || !String(rec(entry)?.coreContribution).trim())) findings.push(finding("STORYBOARD_COMMUNICATION_INVALID", "plan.storyboard.json", "every slide must state how it contributes to the communication core"));
  const composition = schemaRecord(
    files,
    "plan.skill-composition.json",
    SKILL_COMPOSITION_SCHEMA,
    "SKILL_COMPOSITION_INVALID",
    findings
  );
  if (composition && (!Array.isArray(composition.workers) || !composition.workers.every((entry) => {
    const worker = rec(entry);
    return worker && !Object.hasOwn(worker, "revision") && typeof worker.name === "string" && ["used", "skipped", "unavailable"].includes(String(worker.status));
  })))
    findings.push(
      finding(
        "SKILL_COMPOSITION_INVALID",
        "plan.skill-composition.json",
        "workers must declare name and used/skipped/unavailable status"
      )
    );
  const design = schemaRecord(
    files,
    "design.system.json",
    DESIGN_SYSTEM_SCHEMA,
    "DESIGN_SYSTEM_INVALID",
    findings
  );
  if (design) validateDesignSystem(design, findings);
  const project = schemaRecord(
    files,
    "pptx.project.json",
    PROJECT_SCHEMA,
    "PROJECT_INVALID",
    findings
  );
  if (project && (project.artifactId !== model.artifactId || project.layout !== "LAYOUT_16X9" || project.entry !== "src/deck.ts" || project.slideManifest !== "src/slides/manifest.json" || project.designSystem !== "design.system.json"))
    findings.push(
      finding(
        "PROJECT_INVALID",
        "pptx.project.json",
        "project must bind artifactId and the fixed editable 16:9 source contract"
      )
    );
  return { storyboardSlides };
}
function validateSlideSource(files, entry, findings) {
  const item = rec(entry);
  const sourceName = item?.source;
  const sourceMatch = typeof sourceName === "string" ? sourceName.match(SLIDE_SOURCE) : null;
  const sourcePath = typeof sourceName === "string" ? posix.join("src/slides", sourceName) : "src/slides/manifest.json";
  if (!sourceMatch) {
    findings.push(
      finding(
        "SLIDE_NAME_INVALID",
        sourcePath,
        "slide source must use NNN-slug.ts"
      )
    );
    return;
  }
  if (Number(sourceMatch.groups?.index) !== item?.index)
    findings.push(
      finding(
        "SLIDE_INDEX_MISMATCH",
        sourcePath,
        "filename index must match manifest index"
      )
    );
  const source = files[sourcePath];
  if (typeof source !== "string") {
    findings.push(
      finding(
        "SLIDE_SOURCE_MISSING",
        sourcePath,
        "manifest slide source is missing"
      )
    );
    return;
  }
  if (SLIDE_OWNER_VIOLATION.test(source))
    findings.push(
      finding(
        "SLIDE_OWNER_VIOLATION",
        sourcePath,
        "slide module may only modify the provided slide context"
      )
    );
  if ((source.match(/export\s+(?:async\s+)?function\s+renderSlide\s*\(/gu) ?? []).length !== 1)
    findings.push(
      finding(
        "SLIDE_EXPORT_INVALID",
        sourcePath,
        "slide module must export exactly one renderSlide function"
      )
    );
  if (/from\s+["']\.\/[0-9]{3}-[^"']+["']/u.test(source))
    findings.push(
      finding(
        "CROSS_SLIDE_IMPORT",
        sourcePath,
        "slide modules may not import sibling slides"
      )
    );
}
function validateManifest(files, storyboardSlides, findings) {
  const manifest = schemaRecord(
    files,
    "src/slides/manifest.json",
    SLIDE_MANIFEST_SCHEMA,
    "MANIFEST_INVALID",
    findings
  );
  const slides = list(manifest?.slides);
  if (manifest && !slides.length)
    findings.push(
      finding(
        "MANIFEST_INVALID",
        "src/slides/manifest.json",
        "manifest slides must be a non-empty array"
      )
    );
  const ids = /* @__PURE__ */ new Set();
  slides.forEach((entry, index) => {
    const item = rec(entry);
    if (item?.index !== index + 1 || typeof item.id !== "string" || ids.has(item.id) || !validDisplayTitle(item.displayTitle) || typeof item.role !== "string" || !isObject(item.visual) || !isObject(item.accessibility))
      findings.push(
        finding(
          "SLIDE_SEQUENCE_INVALID",
          "src/slides/manifest.json",
          "slide indexes and ids must be unique, contiguous, and include compact displayTitle, role, visual, and accessibility"
        )
      );
    ids.add(item?.id);
    validateSlideSource(files, entry, findings);
  });
  if (storyboardSlides.length && (storyboardSlides.length !== slides.length || storyboardSlides.some(
    (entry, index) => {
      const planned = rec(entry);
      const actual = rec(slides[index]);
      const plannedVisual = rec(planned?.visual);
      const actualVisual = rec(actual?.visual);
      return planned?.id !== actual?.id || planned?.displayTitle !== actual?.displayTitle || plannedVisual?.type !== actualVisual?.type || plannedVisual?.variant !== actualVisual?.variant || plannedVisual?.mode !== actualVisual?.mode;
    }
  )))
    findings.push(
      finding(
        "STORYBOARD_MANIFEST_MISMATCH",
        "src/slides/manifest.json",
        "manifest must preserve storyboard page count, ids, display titles, and visual declarations"
      )
    );
  return slides;
}
function xmlRelationships(xml) {
  const relationships = [];
  const document = new import_xmldom.DOMParser({
    onError: (level, message) => {
      if (level === "fatalError" || level === "error")
        throw new Error(`PPTX_XML_INVALID:${message}`);
    }
  }).parseFromString(xml, "application/xml");
  for (const element of Array.from(
    document.getElementsByTagName("Relationship")
  )) {
    relationships.push({
      id: element.getAttribute("Id") ?? "",
      target: element.getAttribute("Target") ?? "",
      type: element.getAttribute("Type") ?? "",
      external: element.getAttribute("TargetMode") === "External"
    });
  }
  return relationships;
}
function numberAttribute(element, name) {
  return Number(element?.getAttribute(name) ?? 0);
}
function firstDescendant(element, name) {
  return element.getElementsByTagName(name).item(0);
}
function inspectSlideXml(xml, index) {
  const document = new import_xmldom.DOMParser({
    onError: (level, message) => {
      if (level === "fatalError" || level === "error")
        throw new Error(`PPTX_XML_INVALID:${message}`);
    }
  }).parseFromString(xml, "application/xml");
  const allObjects = [];
  const append = (element, fallbackKind) => {
    const nonVisual = firstDescendant(element, "p:cNvPr");
    const name = nonVisual?.getAttribute("name") ?? "";
    if (!name) return;
    const transform = firstDescendant(element, "a:xfrm");
    const offset = transform ? firstDescendant(transform, "a:off") : null;
    const extent = transform ? firstDescendant(transform, "a:ext") : null;
    const x = numberAttribute(offset, "x") / EMU_PER_INCH;
    const y = numberAttribute(offset, "y") / EMU_PER_INCH;
    const w = numberAttribute(extent, "cx") / EMU_PER_INCH;
    const h = numberAttribute(extent, "cy") / EMU_PER_INCH;
    const geometry = firstDescendant(element, "a:prstGeom");
    const kind = geometry?.getAttribute("prst") || fallbackKind;
    const texts = Array.from(element.getElementsByTagName("a:t"));
    const text = texts.map((entry) => entry.textContent ?? "").join("");
    const paragraphs = element.getElementsByTagName("a:p").length;
    const lineBreaks = element.getElementsByTagName("a:br").length + Math.max(0, paragraphs - 1);
    const line = firstDescendant(element, "a:ln");
    const beginArrow = firstDescendant(element, "a:headEnd")?.getAttribute(
      "type"
    );
    const endArrow = firstDescendant(element, "a:tailEnd")?.getAttribute(
      "type"
    );
    const flipH = transform?.getAttribute("flipH") === "1";
    const flipV = transform?.getAttribute("flipV") === "1";
    const start = kind === "line" ? { x: flipH ? x + w : x, y: flipV ? y + h : y } : void 0;
    const end = kind === "line" ? { x: flipH ? x : x + w, y: flipV ? y : y + h } : void 0;
    allObjects.push({
      name,
      kind,
      ...text ? { text } : {},
      ...text ? { lineBreaks } : {},
      bounds: { x, y, w, h },
      ...start ? { start } : {},
      ...end ? { end } : {},
      ...beginArrow ? { beginArrow } : {},
      ...endArrow ? { endArrow } : {},
      ...line?.hasAttribute("w") ? {
        lineWidthIn: numberAttribute(line, "w") / EMU_PER_INCH
      } : {}
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
    return !name.startsWith("pptx:title:") && !name.startsWith("pptx:chrome:") && centerY >= SLIDE_HEIGHT_IN * 0.15 && centerY <= SLIDE_HEIGHT_IN * 0.9;
  });
  const layoutFingerprint = body.map(({ kind, bounds }) => {
    const x = Math.max(
      0,
      Math.min(11, Math.floor((bounds.x + bounds.w / 2) / SLIDE_WIDTH_IN * 12))
    );
    const y = Math.max(
      0,
      Math.min(6, Math.floor((bounds.y + bounds.h / 2) / SLIDE_HEIGHT_IN * 7))
    );
    const w = Math.max(1, Math.min(12, Math.round(bounds.w / SLIDE_WIDTH_IN * 12)));
    const h = Math.max(1, Math.min(7, Math.round(bounds.h / SLIDE_HEIGHT_IN * 7)));
    return `${kind}:${x}:${y}:${w}:${h}`;
  }).sort();
  return {
    index,
    objects: allObjects.filter(({ name }) => name.startsWith("pptx:")),
    layoutFingerprint,
    bodyObjectCount: body.length
  };
}
function inspectPptxPackage(bytes) {
  if (bytes.length < 4 || bytes[0] !== 80 || bytes[1] !== 75)
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
    }
  });
  const names = new Set(Object.keys(entries));
  const requiredParts = [
    "[Content_Types].xml",
    "_rels/.rels",
    "ppt/presentation.xml",
    "ppt/_rels/presentation.xml.rels"
  ];
  if (!requiredParts.every((name) => names.has(name)))
    throw new Error("PPTX_REQUIRED_PART_MISSING");
  const decode = (name) => UTF8.decode(entries[name]);
  const externalRelationships = [];
  const unresolvedRelationships = [];
  for (const name of [...names].filter((entry) => entry.endsWith(".rels"))) {
    const source = name === "_rels/.rels" ? "" : name.replace(/_rels\/([^/]+)\.rels$/u, "$1");
    for (const relationship of xmlRelationships(decode(name))) {
      if (relationship.external) {
        externalRelationships.push(`${name}:${relationship.target}`);
        continue;
      }
      const target = posix.normalize(
        posix.join(posix.dirname(source), relationship.target)
      );
      if (!names.has(target))
        unresolvedRelationships.push(`${name}:${relationship.id}:${target}`);
    }
  }
  const slides = [...names].filter((name) => /^ppt\/slides\/slide[0-9]+\.xml$/u.test(name)).sort(
    (a, b) => Number(a.match(/[0-9]+/u)?.[0]) - Number(b.match(/[0-9]+/u)?.[0])
  );
  if (!slides.length) throw new Error("PPTX_SLIDES_MISSING");
  for (const slide of slides) {
    const rels = `ppt/slides/_rels/${basename(slide)}.rels`;
    if (!names.has(rels) || !xmlRelationships(decode(rels)).some(
      (entry) => entry.type.endsWith("/slideLayout") && !entry.external
    ))
      throw new Error(`PPTX_SLIDE_LAYOUT_MISSING:${slide}`);
  }
  return {
    slideCount: slides.length,
    requiredParts,
    externalRelationships: externalRelationships.sort(),
    unresolvedRelationships: unresolvedRelationships.sort(),
    media: [...names].filter((name) => /^ppt\/media\/[^/]+$/u.test(name)).sort().map((path) => ({ path, sha256: digest(entries[path] ?? new Uint8Array()) })),
    slides: slides.map(
      (path, index) => inspectSlideXml(decode(path), index + 1)
    )
  };
}
function inspectPng(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE))
    throw new Error("PNG_SIGNATURE_INVALID");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width <= 0 || height <= 0) throw new Error("PNG_DIMENSIONS_INVALID");
  return { width, height };
}
function pointDistance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
function boundaryDistance(point, bounds) {
  const right = bounds.x + bounds.w;
  const bottom = bounds.y + bounds.h;
  if (point.x >= bounds.x && point.x <= right && point.y >= bounds.y && point.y <= bottom)
    return Math.min(
      point.x - bounds.x,
      right - point.x,
      point.y - bounds.y,
      bottom - point.y
    );
  const dx = Math.max(bounds.x - point.x, 0, point.x - right);
  const dy = Math.max(bounds.y - point.y, 0, point.y - bottom);
  return Math.hypot(dx, dy);
}
function pointInside(point, bounds) {
  return point.x > bounds.x && point.x < bounds.x + bounds.w && point.y > bounds.y && point.y < bounds.y + bounds.h;
}
function segmentIntersectsBounds(start, end, bounds) {
  if (pointInside(start, bounds) || pointInside(end, bounds)) return true;
  const edges = [
    [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y }
    ],
    [
      { x: bounds.x + bounds.w, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h }
    ],
    [
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      { x: bounds.x, y: bounds.y + bounds.h }
    ],
    [
      { x: bounds.x, y: bounds.y + bounds.h },
      { x: bounds.x, y: bounds.y }
    ]
  ];
  const orientation = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return edges.some(([left, right]) => {
    if (Math.max(start.x, end.x) < Math.min(left.x, right.x) || Math.max(left.x, right.x) < Math.min(start.x, end.x) || Math.max(start.y, end.y) < Math.min(left.y, right.y) || Math.max(left.y, right.y) < Math.min(start.y, end.y))
      return false;
    const first = orientation(start, end, left);
    const second = orientation(start, end, right);
    const third = orientation(left, right, start);
    const fourth = orientation(left, right, end);
    return first * second <= 0 && third * fourth <= 0;
  });
}
function arrowPresent(value) {
  return Boolean(value && value !== "none");
}
function validateRenderedSemantics(inspection, storyboardSlides, findings, pptxPath) {
  for (const [offset, raw] of storyboardSlides.entries()) {
    const slide = rec(raw);
    const inspected = inspection.slides[offset];
    if (!slide || !inspected) continue;
    const slideId = String(slide.id ?? "");
    const titleName = `pptx:title:${slideId}`;
    const titles = inspected.objects.filter(({ name }) => name === titleName);
    const actualTitle = titles[0]?.text?.replace(/\s+/gu, " ").trim();
    if (titles.length !== 1 || titles[0]?.lineBreaks !== 0 || actualTitle !== String(slide.displayTitle ?? "").replace(/\s+/gu, " ").trim())
      findings.push(
        finding(
          "PPTX_TITLE_MISMATCH",
          `${pptxPath}#slide=${offset + 1}`,
          "each slide must contain exactly one named title whose text matches displayTitle"
        )
      );
    const visual = rec(slide.visual);
    if (visual?.type !== "diagram" || visual.mode !== "native") continue;
    const nodeSpecs = list(visual.nodes).map(rec);
    const nodes = /* @__PURE__ */ new Map();
    for (const spec of nodeSpecs) {
      const id = String(spec?.id ?? "");
      const name = `pptx:node:${slideId}:${id}`;
      const matches = inspected.objects.filter((object) => object.name === name);
      if (matches.length === 1 && matches[0]) nodes.set(id, matches[0]);
      else
        findings.push(
          finding(
            "PPTX_RELATION_GEOMETRY_INVALID",
            `${pptxPath}#slide=${offset + 1}`,
            `native diagram node ${id} must map to exactly one named shape`
          )
        );
    }
    for (const relation of list(visual.relations).map(rec)) {
      const relationId = String(relation?.id ?? "");
      const kind = String(relation?.kind ?? "");
      const source = nodes.get(String(relation?.from ?? ""));
      const target = nodes.get(String(relation?.to ?? ""));
      if (!source || !target) continue;
      const edgePrefix = `pptx:edge:${slideId}:${relationId}:`;
      const edges = inspected.objects.filter(({ name }) => name.startsWith(edgePrefix)).sort(
        (left, right) => Number(left.name.slice(edgePrefix.length)) - Number(right.name.slice(edgePrefix.length))
      );
      if (kind === "disconnect") {
        const markerName = `pptx:marker:${slideId}:${relationId}`;
        const markers = inspected.objects.filter(
          ({ name }) => name === markerName
        );
        const marker = markers[0];
        const markerCenter = marker ? {
          x: marker.bounds.x + marker.bounds.w / 2,
          y: marker.bounds.y + marker.bounds.h / 2
        } : void 0;
        const sourceCenter = {
          x: source.bounds.x + source.bounds.w / 2,
          y: source.bounds.y + source.bounds.h / 2
        };
        const targetCenter = {
          x: target.bounds.x + target.bounds.w / 2,
          y: target.bounds.y + target.bounds.h / 2
        };
        const span = pointDistance(sourceCenter, targetCenter);
        const routeDistance = markerCenter ? pointDistance(sourceCenter, markerCenter) + pointDistance(markerCenter, targetCenter) : Number.POSITIVE_INFINITY;
        if (edges.length || markers.length !== 1 || !markerCenter || pointInside(markerCenter, source.bounds) || pointInside(markerCenter, target.bounds) || routeDistance > span + 0.12)
          findings.push(
            finding(
              "PPTX_RELATION_GEOMETRY_INVALID",
              `${pptxPath}#slide=${offset + 1}&relation=${relationId}`,
              "disconnect relations require one between-node marker and no connector line"
            )
          );
        continue;
      }
      const expectedSegments = Number(relation?.segmentCount ?? 1);
      if (edges.length !== expectedSegments || edges.some(
        (edge, index) => edge.name !== `${edgePrefix}${index}` || !edge.start || !edge.end
      )) {
        findings.push(
          finding(
            "PPTX_RELATION_GEOMETRY_INVALID",
            `${pptxPath}#slide=${offset + 1}&relation=${relationId}`,
            "relation line segments must be complete, contiguous, and zero-indexed"
          )
        );
        continue;
      }
      const first = edges[0];
      const last = edges.at(-1);
      if (!first?.start || !last?.end) continue;
      const tolerance = Math.max(
        0.08,
        ...edges.map(({ lineWidthIn = 0 }) => lineWidthIn / 2)
      );
      let geometryInvalid = boundaryDistance(first.start, source.bounds) > tolerance || boundaryDistance(last.end, target.bounds) > tolerance;
      for (let index = 1; index < edges.length; index += 1) {
        const previous = edges[index - 1];
        const current = edges[index];
        if (!previous?.end || !current?.start || pointDistance(previous.end, current.start) > tolerance)
          geometryInvalid = true;
      }
      const related = /* @__PURE__ */ new Set([String(relation?.from), String(relation?.to)]);
      for (const edge of edges) {
        if (!edge.start || !edge.end) continue;
        for (const [nodeId, node] of nodes) {
          if (!related.has(nodeId) && segmentIntersectsBounds(edge.start, edge.end, node.bounds))
            geometryInvalid = true;
        }
      }
      if (geometryInvalid)
        findings.push(
          finding(
            "PPTX_RELATION_GEOMETRY_INVALID",
            `${pptxPath}#slide=${offset + 1}&relation=${relationId}`,
            "relation endpoints must touch declared nodes, segments must join, and routes must avoid unrelated nodes"
          )
        );
      const styleInvalid = kind === "association" ? edges.some(
        ({ beginArrow, endArrow }) => arrowPresent(beginArrow) || arrowPresent(endArrow)
      ) : edges.some(
        ({ beginArrow, endArrow }, index) => arrowPresent(beginArrow) || (index === edges.length - 1 ? !arrowPresent(endArrow) : arrowPresent(endArrow))
      );
      if (styleInvalid)
        findings.push(
          finding(
            "PPTX_RELATION_STYLE_INVALID",
            `${pptxPath}#slide=${offset + 1}&relation=${relationId}`,
            "flow and dependency arrows belong only at the target; associations have no arrows"
          )
        );
    }
  }
}
function validateRendered(model, slides, storyboardSlides, findings) {
  const files = model.files ?? {};
  const pptxPath = `dist/${model.artifactId}.pptx`;
  const pdfPath = `dist/${model.artifactId}.pdf`;
  try {
    const inspection = inspectPptxPackage(bytesOf(files[pptxPath]));
    if (inspection.slideCount !== slides.length || inspection.unresolvedRelationships.length)
      findings.push(
        finding(
          "PPTX_STRUCTURE_INVALID",
          pptxPath,
          "PPTX slide count and internal relationships must match the manifest"
        )
      );
    validateRenderedSemantics(
      inspection,
      storyboardSlides,
      findings,
      pptxPath
    );
    const expectedDiagramDigests = storyboardSlides.map((entry) => rec(rec(entry)?.visual)?.sha256).filter((value) => typeof value === "string");
    if (expectedDiagramDigests.length && (inspection.externalRelationships.length > 0 || expectedDiagramDigests.some(
      (expected) => !inspection.media.some(({ sha256 }) => sha256 === expected)
    ))) findings.push(
      finding(
        "DIAGRAM_MEDIA_MISMATCH",
        pptxPath,
        "every diagram slide must embed the current SVG bytes and use no external package relationship"
      )
    );
  } catch (error) {
    findings.push(
      finding(
        "PPTX_INVALID",
        pptxPath,
        error instanceof Error ? error.message : String(error)
      )
    );
  }
  const pdf = bytesOf(files[pdfPath]);
  if (pdf.length < 5 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-")
    findings.push(
      finding(
        "PDF_INVALID",
        pdfPath,
        "PDF must have a valid PDF signature and originate from the final PPTX"
      )
    );
  const pagePaths = Object.keys(files).filter((name) => /^dist\/pages\/[0-9]{3}\.png$/u.test(name)).sort();
  if (pagePaths.length !== slides.length || pagePaths.some(
    (name, index) => name !== `dist/pages/${String(index + 1).padStart(3, "0")}.png`
  ))
    findings.push(
      finding(
        "PAGE_MAPPING_INVALID",
        "dist/pages",
        "page PNGs must be contiguous and one-to-one with manifest slides"
      )
    );
  for (const pagePath of pagePaths)
    try {
      inspectPng(bytesOf(files[pagePath]));
    } catch {
      findings.push(
        finding("PNG_INVALID", pagePath, "rendered page must be a valid PNG")
      );
    }
  for (const entry of slides) {
    const item = rec(entry);
    const source = typeof item?.source === "string" ? `src/slides/${item.source}` : "";
    const preview = source ? `${source.slice(0, -3)}.${fileDigest(model, source)}.png` : "";
    if (!preview || !(preview in files))
      findings.push(
        finding(
          "PREVIEW_MISSING",
          preview || "src/slides",
          "current source-hash preview is required after render"
        )
      );
    else
      try {
        inspectPng(bytesOf(files[preview]));
      } catch {
        findings.push(
          finding("PNG_INVALID", preview, "slide preview must be a valid PNG")
        );
      }
  }
  const render = schemaRecord(
    files,
    "evidence.render.json",
    RENDER_EVIDENCE_SCHEMA,
    "RENDER_EVIDENCE_INVALID",
    findings
  );
  if (render && (!sourceDigestRecord(model, render) || rec(render.output)?.pptxSha256 !== model.digests?.[pptxPath] || rec(render.output)?.pdfSha256 !== model.digests?.[pdfPath] || render.pageCount !== slides.length))
    findings.push(
      finding(
        "RENDER_EVIDENCE_INVALID",
        "evidence.render.json",
        "render evidence must bind current sources and every rendered output"
      )
    );
}
function validateEvidence(model, slides, findings) {
  const files = model.files ?? {};
  const pptxPath = `dist/${model.artifactId}.pptx`;
  const structure = schemaRecord(
    files,
    "evidence.structure.json",
    STRUCTURE_EVIDENCE_SCHEMA,
    "STRUCTURE_EVIDENCE_INVALID",
    findings
  );
  if (structure && (!sourceDigestRecord(model, structure) || rec(structure.output)?.sha256 !== model.digests?.[pptxPath] || rec(structure.package)?.slideCount !== slides.length || structure.verdict !== "pass"))
    findings.push(
      finding(
        "STRUCTURE_EVIDENCE_INVALID",
        "evidence.structure.json",
        "structure evidence must pass and bind current PPTX structure"
      )
    );
  const design = schemaRecord(
    files,
    "evidence.design.json",
    DESIGN_EVIDENCE_SCHEMA,
    "DESIGN_EVIDENCE_INVALID",
    findings
  );
  const designChecks = list(design?.checks).map(rec).filter((check) => Boolean(check));
  const designRoles = rec(
    rec(parseJson(files, "design.system.json"))?.typography
  )?.roles;
  const requiredTypeRoles = Object.keys(rec(designRoles) ?? {});
  const layoutRhythm = rec(design?.layoutRhythm);
  const layoutPages = list(layoutRhythm?.pages);
  if (design && (!sourceDigestRecord(model, design) || design.designSystemSha256 !== model.digests?.["design.system.json"] || design.verdict !== "pass" || !designChecks.length || designChecks.some((check) => check.status !== "pass") || requiredTypeRoles.some(
    (role) => !designChecks.some(
      (check) => check.criterion === `typography:${role}` && check.source === "design-system-measurement"
    )
  ) || layoutPages.length !== slides.length || layoutPages.some(
    (entry, index) => rec(entry)?.index !== index + 1 || !Array.isArray(rec(entry)?.fingerprint) || !Number.isInteger(rec(entry)?.bodyObjectCount)
  ) || !Array.isArray(layoutRhythm?.similarGroups)))
    findings.push(
      finding(
        "DESIGN_EVIDENCE_INVALID",
        "evidence.design.json",
        "design evidence must bind typography measurements and per-page layout-rhythm fingerprints"
      )
    );
  const accessibility = schemaRecord(
    files,
    "evidence.accessibility.json",
    ACCESSIBILITY_EVIDENCE_SCHEMA,
    "ACCESSIBILITY_EVIDENCE_INVALID",
    findings
  );
  if (accessibility && (!sourceDigestRecord(model, accessibility) || accessibility.outputSha256 !== model.digests?.[pptxPath] || accessibility.verdict !== "pass" || !Array.isArray(accessibility.checks) || !accessibility.checks.length || accessibility.checks.some(
    (entry) => !isObject(entry) || ![
      "measurement",
      "tool-report",
      "manual-walkthrough",
      "content-review"
    ].includes(String(entry.source)) || entry.status !== "pass"
  )))
    findings.push(
      finding(
        "ACCESSIBILITY_EVIDENCE_INVALID",
        "evidence.accessibility.json",
        "accessibility evidence must bind the final PPTX and contain passing, attributable checks"
      )
    );
}
function presentationReviewChecksValid(value, relationshipRequired, allowedAnchors) {
  const checks = rec(value);
  if (!checks) return false;
  return REVIEW_CHECKS.every((name) => {
    const check = rec(checks[name]);
    if (!check || !["pass", "not-applicable"].includes(String(check.status)) || !Array.isArray(check.anchors) || !check.anchors.length || !check.anchors.every((anchor) => {
      if (anchor === "deck") return true;
      if (typeof anchor !== "string" || !anchor.startsWith("slide:"))
        return false;
      return !allowedAnchors || allowedAnchors.has(anchor);
    }) || typeof check.evidence !== "string" || !check.evidence.trim())
      return false;
    if (check.status === "not-applicable")
      return name === "relationshipSemantics" && !relationshipRequired && typeof check.rationale === "string" && Boolean(check.rationale.trim());
    return true;
  });
}
function presentationReviewFindingsValid(value, allowedAnchors, pageHashes) {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    const reviewFinding = rec(entry);
    if (!reviewFinding || typeof reviewFinding.id !== "string" || !ID.test(reviewFinding.id) || !["low", "medium", "high", "critical"].includes(
      String(reviewFinding.severity)
    ) || typeof reviewFinding.anchor !== "string" || !reviewFinding.anchor.trim() || reviewFinding.anchor !== "deck" && allowedAnchors && !allowedAnchors.has(reviewFinding.anchor) || typeof reviewFinding.evidence !== "string" || !reviewFinding.evidence.trim() || typeof reviewFinding.recovery !== "string" || !reviewFinding.recovery.trim() || !["resolved", "accepted"].includes(
      String(reviewFinding.disposition)
    ) || reviewFinding.page !== void 0 && (!Number.isInteger(reviewFinding.page) || Number(reviewFinding.page) < 1 || pageHashes && !pageHashes.has(Number(reviewFinding.page))))
      return false;
    if (reviewFinding.disposition === "resolved") {
      const page = Number(reviewFinding.page);
      return typeof reviewFinding.resolutionEvidence === "string" && Boolean(reviewFinding.resolutionEvidence.trim()) && (reviewFinding.page === void 0 || !pageHashes || reviewFinding.resolutionPageSha256 === pageHashes.get(page));
    }
    return !["high", "critical"].includes(String(reviewFinding.severity)) && typeof reviewFinding.acceptanceReason === "string" && Boolean(reviewFinding.acceptanceReason.trim());
  });
}
function validateReview(model, slides, findings) {
  const files = model.files ?? {};
  const review = schemaRecord(
    files,
    "review.pptx.json",
    REVIEW_SCHEMA,
    "REVIEW_INVALID",
    findings
  );
  const reviewer = rec(review?.reviewer);
  const pages = list(review?.pages);
  const render = rec(parseJson(files, "evidence.render.json"));
  const storyboard = rec(parseJson(files, "plan.storyboard.json"));
  const relationshipRequired = list(storyboard?.slides).some((entry) => {
    const visual = rec(rec(entry)?.visual);
    return visual?.type === "diagram";
  });
  const reviewAnchors = new Set(
    list(storyboard?.slides).map(
      (entry) => `slide:${String(rec(entry)?.id ?? "")}`
    )
  );
  const reviewPageHashes = new Map(
    pages.map((entry) => [
      Number(rec(entry)?.index),
      String(rec(entry)?.sha256 ?? "")
    ])
  );
  if (review && (!sourceDigestRecord(model, review) || review.verdict !== "pass" || !reviewer || !["human", "independent-agent"].includes(String(reviewer.kind)) || typeof reviewer.sessionId !== "string" || !reviewer.sessionId || reviewer.sessionId === render?.sessionId || pages.length !== slides.length || pages.some(
    (entry, index) => rec(entry)?.index !== index + 1 || rec(entry)?.sha256 !== model.digests?.[`dist/pages/${String(index + 1).padStart(3, "0")}.png`] || rec(entry)?.verdict !== "pass"
  ) || !presentationReviewFindingsValid(
    review.findings,
    reviewAnchors,
    reviewPageHashes
  ) || !presentationReviewChecksValid(
    review.checks,
    relationshipRequired,
    reviewAnchors
  )))
    findings.push(
      finding(
        "REVIEW_INVALID",
        "review.pptx.json",
        "review must be independent, cover every page, complete all quality checks, and disposition findings with evidence"
      )
    );
  const plan = rec(parseJson(files, "plan.contract.json"));
  const core = rec(plan?.communicationCore);
  if (!communicationReviewValid(review, core?.retellTarget, communicationAnchors(core))) findings.push(finding("COMMUNICATION_REVIEW_INVALID", "review.pptx.json", "presentation review must record a two-pass retell and bind every communication check to the frozen signature cue"));
}
function createPptxReleaseManifest(model) {
  const outputPaths = releaseOutputPaths(model).filter(
    (path) => path !== "release.manifest.json"
  );
  return {
    schema: RELEASE_MANIFEST_SCHEMA,
    plugin: "presentation-production",
    artifactId: model.artifactId,
    subjectDigest: computePptxSubjectDigest(model),
    outputs: outputPaths.map((path) => ({
      path,
      sha256: fileDigest(model, path)
    })),
    roles: {
      pptx: `dist/${model.artifactId}.pptx`,
      pdf: `dist/${model.artifactId}.pdf`,
      pages: "dist/pages",
      structure: "evidence.structure.json",
      design: "evidence.design.json",
      accessibility: "evidence.accessibility.json",
      review: "review.pptx.json"
    }
  };
}
function validateRelease(model, findings) {
  const files = model.files ?? {};
  const manifest = schemaRecord(
    files,
    "release.manifest.json",
    RELEASE_MANIFEST_SCHEMA,
    "RELEASE_MANIFEST_INVALID",
    findings
  );
  if (manifest) {
    const expected = createPptxReleaseManifest(model);
    if (manifest.artifactId !== expected.artifactId || manifest.subjectDigest !== expected.subjectDigest || JSON.stringify(manifest.outputs) !== JSON.stringify(expected.outputs) || JSON.stringify(manifest.roles) !== JSON.stringify(expected.roles))
      findings.push(
        finding(
          "RELEASE_MANIFEST_INVALID",
          "release.manifest.json",
          "release manifest must bind every current output and delivery role"
        )
      );
  }
  if (!validatePptxReceipt(model))
    findings.push(
      finding(
        "RECEIPT_INVALID",
        "receipt.release.json",
        "release receipt must bind current sources and outputs"
      )
    );
}
function validatePptxModel(model, { stage = "source" } = {}) {
  if (typeof stage !== "string" || !STAGES.has(stage))
    return [
      finding(
        "STAGE_INVALID",
        "plan.contract.json",
        `unsupported PPTX stage: ${String(stage)}`
      )
    ];
  const currentStage = stage;
  const findings = [];
  const current = model ?? {};
  const files = current.files ?? {};
  if (".pptx-delivery-journal.json" in files)
    findings.push(
      finding(
        "MUTATION_JOURNAL_OPEN",
        ".pptx-delivery-journal.json",
        "an interrupted writer must be resumed or recovered"
      )
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
    (left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path)
  );
}
function evaluatePptxWrite({
  relativePath = "",
  toolName = "",
  writer = "",
  cwd = ""
} = {}) {
  const normalized = resolve(cwd || ".", relativePath).replaceAll("\\", "/");
  const marker = "/artifacts/pptx/";
  const offset = normalized.indexOf(marker);
  if (offset < 0) return { decision: "allow" };
  const inside = normalized.slice(offset + marker.length).split("/").slice(1).join("/");
  const preview = inside.startsWith("src/slides/") && inside.endsWith(".png");
  const generated = inside === ".pptx-delivery-journal.json" || GENERATED_PATH.test(inside) || preview;
  if (generated && !/^pptx-(?:render|probe|review|release)$/u.test(writer))
    return {
      decision: "deny",
      code: "PROTECTED_WRITER_REQUIRED",
      message: `${inside} must be written by a registered presentation-production writer, not ${toolName || "an unregistered tool"}`
    };
  return { decision: "allow" };
}
function resolveWorkspaceRoot(cwd) {
  const absolute = resolve(cwd);
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: absolute,
      encoding: "utf8",
      timeout: 5e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (root) return resolve(root);
  } catch {
  }
  const parts = absolute.split(sep);
  for (let index = parts.length - 3; index >= 0; index -= 1)
    if (parts[index] === "artifacts" && parts[index + 1] === "pptx")
      return resolve(parts.slice(0, index).join(sep) || sep);
  return absolute;
}
function isPptxProjectRoot(projectRoot, workspaceRoot) {
  return dirname(resolve(projectRoot)) === join(resolve(workspaceRoot), "artifacts", "pptx") && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot));
}
function isTextPath(filePath) {
  return TEXT_BASENAMES.has(basename(filePath)) || TEXT_EXTENSIONS.has(extname(filePath).toLowerCase());
}
async function hashFile(filePath, maxBytes, collectBytes) {
  const before = await lstat(filePath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error(`NOT_A_FILE:${filePath}`);
  if (before.size > BigInt(maxBytes))
    throw new Error(`FILE_SIZE_LIMIT_EXCEEDED:${filePath}`);
  const hash = createHash("sha256");
  const chunks = [];
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
    content: collectBytes ? Buffer.concat(chunks) : null
  };
}
async function collect(root, directory, state, limits) {
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
      text ? Math.min(limits.maxBytesPerFile, limits.maxTextBytes) : limits.maxBytesPerFile,
      true
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
async function loadPptxProject(projectRoot, limits = {}) {
  const root = resolve(projectRoot);
  const state = {
    files: {},
    digests: {},
    sizes: {},
    count: 0
  };
  await collect(root, root, state, {
    maxFiles: limits.maxFiles ?? 4096,
    maxBytesPerFile: limits.maxBytesPerFile ?? 256 * 1024 * 1024,
    maxTextBytes: limits.maxTextBytes ?? 4 * 1024 * 1024
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
    ignored: []
  };
}
async function findPptxProjects(cwd, { maxProjects = 32 } = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const carrierRoot = join(workspaceRoot, "artifacts", "pptx");
  let entries;
  try {
    entries = await readdir(carrierRoot, { withFileTypes: true });
  } catch (error) {
    if (isObject(error) && error.code === "ENOENT") return [];
    throw error;
  }
  const roots = [];
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

export {
  PLAN_SCHEMA,
  STORYBOARD_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  DESIGN_SYSTEM_SCHEMA,
  PROJECT_SCHEMA,
  SLIDE_MANIFEST_SCHEMA,
  RENDER_EVIDENCE_SCHEMA,
  STRUCTURE_EVIDENCE_SCHEMA,
  DESIGN_EVIDENCE_SCHEMA,
  ACCESSIBILITY_EVIDENCE_SCHEMA,
  REVIEW_INPUT_SCHEMA,
  REVIEW_SCHEMA,
  computePptxSubjectDigest,
  createPptxReceipt,
  validatePptxReceipt,
  inspectPptxPackage,
  presentationReviewChecksValid,
  presentationReviewFindingsValid,
  createPptxReleaseManifest,
  validatePptxModel,
  evaluatePptxWrite,
  resolveWorkspaceRoot,
  isPptxProjectRoot,
  loadPptxProject,
  findPptxProjects
};
