// harness-source-hash: sha256:230430fd2f48ea30b2238a97dd35e0ddd2522d1a741868ea1450333d3e33c83b
import {
  unzipSync
} from "./chunk-RQQ3DLME.mjs";
import {
  require_lib
} from "./chunk-FL36SZ6K.mjs";
import {
  __toESM
} from "./chunk-HL4EEBT7.mjs";

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
var PLAN_SCHEMA = "presentation-production/plan/v2";
var STORYBOARD_SCHEMA = "presentation-production/storyboard/v2";
var SKILL_COMPOSITION_SCHEMA = "presentation-production/skill-composition/v1";
var DESIGN_SYSTEM_SCHEMA = "presentation-production/design-system/v2";
var PROJECT_SCHEMA = "presentation-production/project/v2";
var SLIDE_MANIFEST_SCHEMA = "presentation-production/slide-manifest/v2";
var RENDER_EVIDENCE_SCHEMA = "presentation-production/render-evidence/v1";
var STRUCTURE_EVIDENCE_SCHEMA = "presentation-production/structure-evidence/v2";
var DESIGN_EVIDENCE_SCHEMA = "presentation-production/design-evidence/v1";
var ACCESSIBILITY_EVIDENCE_SCHEMA = "presentation-production/accessibility-evidence/v2";
var REVIEW_SCHEMA = "presentation-production/review/v2";
var RELEASE_MANIFEST_SCHEMA = "presentation-production/release-manifest/v2";
var RECEIPT_SCHEMA = "presentation-production/receipt/v2";
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
var digest = (value) => createHash("sha256").update(value).digest("hex");
var isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var rec = (value) => isObject(value) ? value : void 0;
var list = (value) => Array.isArray(value) ? value : [];
var bytesOf = (value) => Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : "");
var finding = (code, path, message) => ({ code, path, message });
var stageAtLeast = (stage, expected) => STAGE_RANK[stage] >= STAGE_RANK[expected];
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
function validateSourceSchemas(model, files, findings) {
  const plan = schemaRecord(
    files,
    "plan.contract.json",
    PLAN_SCHEMA,
    "PLAN_INVALID",
    findings
  );
  if (plan && (plan.artifactId !== model.artifactId || !STAGES.has(plan.targetStage) || typeof plan.audience !== "string" || typeof plan.objective !== "string" || typeof plan.language !== "string"))
    findings.push(
      finding(
        "PLAN_INVALID",
        "plan.contract.json",
        "plan must bind artifactId, targetStage, audience, objective, and language"
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
  if (storyboard && (!storyboardSlides.length || !storyboardSlides.every(
    (entry, index) => rec(entry)?.index === index + 1 && typeof rec(entry)?.id === "string" && typeof rec(entry)?.title === "string" && typeof rec(entry)?.role === "string" && typeof rec(entry)?.visualType === "string"
  )))
    findings.push(
      finding(
        "STORYBOARD_INVALID",
        "plan.storyboard.json",
        "storyboard slides must be non-empty, contiguous, and declare id, title, role, and visualType"
      )
    );
  for (const [index, entry] of storyboardSlides.entries()) {
    const slide = rec(entry);
    if (slide?.visualType !== "diagram") continue;
    const diagram = rec(slide.diagram);
    const path = typeof diagram?.asset === "string" ? diagram.asset : `plan.storyboard.json#slides/${index}/diagram`;
    if (!diagram || typeof diagram.asset !== "string" || !/^assets\/diagrams\/[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/u.test(diagram.asset) || !/^[a-f0-9]{64}$/u.test(String(diagram.sha256 ?? "")) || !["contain", "cover"].includes(String(diagram.fit)) || typeof diagram.takeaway !== "string" || !diagram.takeaway.trim() || typeof diagram.alt !== "string" || !diagram.alt.trim()) {
      findings.push(finding("DIAGRAM_ASSET_INVALID", path, "diagram slides require a local assets/diagrams/*.svg asset, SHA-256, contain/cover fit, takeaway, and alt text"));
      continue;
    }
    const asset = files[diagram.asset];
    if (typeof asset !== "string" || digest(Buffer.from(asset)) !== diagram.sha256) {
      findings.push(finding("DIAGRAM_ASSET_INVALID", diagram.asset, "diagram SVG must exist and match the declared SHA-256"));
      continue;
    }
    if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/iu.test(asset) || hasUnsafeSvgReference(asset)) findings.push(finding("DIAGRAM_ASSET_UNSAFE", diagram.asset, "diagram SVG must be self-contained and contain no executable or external content"));
  }
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
    if (item?.index !== index + 1 || typeof item.id !== "string" || ids.has(item.id) || typeof item.title !== "string" || typeof item.role !== "string" || !isObject(item.accessibility))
      findings.push(
        finding(
          "SLIDE_SEQUENCE_INVALID",
          "src/slides/manifest.json",
          "slide indexes and ids must be unique, contiguous, and include title, role, and accessibility"
        )
      );
    ids.add(item?.id);
    validateSlideSource(files, entry, findings);
  });
  if (storyboardSlides.length && (storyboardSlides.length !== slides.length || storyboardSlides.some(
    (entry, index) => rec(entry)?.id !== rec(slides[index])?.id
  )))
    findings.push(
      finding(
        "STORYBOARD_MANIFEST_MISMATCH",
        "src/slides/manifest.json",
        "manifest must preserve storyboard page count and ids"
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
    media: [...names].filter((name) => /^ppt\/media\/[^/]+$/u.test(name)).sort().map((path) => ({ path, sha256: digest(entries[path] ?? new Uint8Array()) }))
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
    const expectedDiagramDigests = storyboardSlides.map((entry) => rec(rec(entry)?.diagram)?.sha256).filter((value) => typeof value === "string");
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
  if (design && (!sourceDigestRecord(model, design) || design.designSystemSha256 !== model.digests?.["design.system.json"] || design.verdict !== "pass" || !designChecks.length || designChecks.some((check) => check.status !== "pass") || requiredTypeRoles.some(
    (role) => !designChecks.some(
      (check) => check.criterion === `typography:${role}` && check.source === "design-system-measurement"
    )
  )))
    findings.push(
      finding(
        "DESIGN_EVIDENCE_INVALID",
        "evidence.design.json",
        "design evidence must bind the design system and cover every typography role with passing carrier measurements"
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
  if (review && (!sourceDigestRecord(model, review) || review.verdict !== "pass" || !reviewer || !["human", "independent-agent"].includes(String(reviewer.kind)) || typeof reviewer.sessionId !== "string" || !reviewer.sessionId || reviewer.sessionId === render?.sessionId || pages.length !== slides.length || pages.some(
    (entry, index) => rec(entry)?.index !== index + 1 || rec(entry)?.sha256 !== model.digests?.[`dist/pages/${String(index + 1).padStart(3, "0")}.png`] || rec(entry)?.verdict !== "pass"
  ) || !Array.isArray(review.findings) || review.findings.some(
    (entry) => !isObject(entry) || !["resolved", "accepted"].includes(String(entry.disposition))
  )))
    findings.push(
      finding(
        "REVIEW_INVALID",
        "review.pptx.json",
        "review must be independent, cover every current page, and disposition every finding"
      )
    );
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
  REVIEW_SCHEMA,
  computePptxSubjectDigest,
  createPptxReceipt,
  validatePptxReceipt,
  inspectPptxPackage,
  createPptxReleaseManifest,
  validatePptxModel,
  evaluatePptxWrite,
  resolveWorkspaceRoot,
  isPptxProjectRoot,
  loadPptxProject,
  findPptxProjects
};
