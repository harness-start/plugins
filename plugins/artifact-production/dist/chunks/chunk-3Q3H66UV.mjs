// harness-source-hash: sha256:094ae85928967976215355a7d8cc86aa39fa623154b1006d53784ddde5b76db8
import {
  projectInside
} from "./chunk-FLUQYJTI.mjs";
import {
  communicationAnchors,
  communicationCoreValid,
  communicationReviewValid
} from "./chunk-PAM3R2KB.mjs";

// plugins/artifact-production/src/domains/print/lib/contract.ts
import { createHash } from "node:crypto";
var SECTION_SOURCE = /^(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.section\.tsx$/u;
var GENERATED_PATH = /^(?:build\/html\/|dist\/|evidence(?:\/|\.[^/]+\.json$)|evidence\.accessibility\.json$|review\.print\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$)/u;
var UNIT_VIOLATION = /(?:\b(?:useState|useEffect|useLayoutEffect|useReducer|hydrateRoot|createRoot|createPortal|fetch|setTimeout|setInterval)\s*\(|from\s+["'](?:react-router|react-router-dom|node:fs|node:child_process)["']|https?:\/\/|\b(?:Date\.now|Math\.random)\s*\()/u;
var RECEIPT_EXCLUDED_PATH = /^(?:build\/|dist\/|evidence(?:\.|\/)|review\.print\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$|\.print-delivery-journal\.json$)/u;
var PLUGIN = "print-publication-production";
var PLAN_SCHEMA = `${PLUGIN}/plan/v1`;
var REVIEW_SCHEMA = `${PLUGIN}/review/v3`;
var RELEASE_MANIFEST_SCHEMA = `${PLUGIN}/release-manifest/v2`;
var EVIDENCE_SCHEMAS = {
  "evidence/pdf.json": `${PLUGIN}/pdf-evidence/v1`,
  "evidence/fonts.json": `${PLUGIN}/fonts-evidence/v1`,
  "evidence/images.json": `${PLUGIN}/images-evidence/v1`,
  "evidence/pagination.json": `${PLUGIN}/pagination-evidence/v1`,
  "evidence/preflight.json": `${PLUGIN}/preflight-evidence/v1`,
  "evidence.accessibility.json": `${PLUGIN}/accessibility-evidence/v1`
};
var sha256 = (value) => createHash("sha256").update(value).digest("hex");
var finding = (code, path, message) => ({ code, path, message });
var isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var rec = (value) => isObject(value) ? value : void 0;
var asList = (value) => Array.isArray(value) ? value : [];
var textOf = (value) => Buffer.isBuffer(value) ? value.toString("utf8") : typeof value === "string" ? value : "";
function validateIndependentReviewFile(model, filePath, findings) {
  const files = model.files ?? {};
  let review;
  try {
    review = JSON.parse(files[filePath] === void 0 ? "null" : textOf(files[filePath]));
  } catch {
    review = null;
  }
  const reviewRec = rec(review);
  if (!review || reviewRec?.schema !== REVIEW_SCHEMA || reviewRec?.plugin !== PLUGIN || reviewRec?.artifactId !== model.artifactId || reviewRec?.subjectDigest !== computePrintSubjectDigest(model) || reviewRec?.verdict !== "pass") {
    findings.push(finding("REVIEW_INVALID", filePath, "review must be a passing independent review bound to the current artifact"));
    return;
  }
  const reviewer = rec(reviewRec?.reviewer);
  if (!["human", "independent-agent"].includes(reviewer?.kind) || typeof reviewer?.sessionId !== "string" || !reviewer.sessionId) {
    findings.push(finding("REVIEWER_INVALID", filePath, "reviewer must declare kind and sessionId"));
    return;
  }
  if (reviewer.sessionId === (process.env.AI_EXPERTS_SESSION_ID || "unknown")) {
    findings.push(finding("REVIEW_SELF", filePath, "reviewer session must differ from the current release session"));
  }
  const coverage = asList(reviewRec.coverage).map(rec);
  const expectedPaths = printReviewCoveragePaths(model);
  if (coverage.length !== expectedPaths.length || coverage.some((entry, index) => entry?.path !== expectedPaths[index] || entry?.sha256 !== fileDigest(model, expectedPaths[index] ?? ""))) {
    findings.push(finding("REVIEW_COVERAGE_INVALID", filePath, "review coverage must bind every current PDF and evidence digest"));
  }
  const checks = asList(reviewRec.checks).map(rec);
  if (!["typography", "pagination", "preflight"].every((id) => checks.some((check) => check?.id === id && check?.status === "pass"))) {
    findings.push(finding("REVIEW_CHECKS_INVALID", filePath, "review must pass typography, pagination, and preflight checks"));
  }
  const plan = rec(parseJson(model.files ?? {}, "plan.contract.json", findings));
  const core = rec(plan?.communicationCore);
  if (!communicationReviewValid(reviewRec, core?.retellTarget, communicationAnchors(core))) findings.push(finding("COMMUNICATION_REVIEW_INVALID", filePath, "print review must record a two-pass retell and bind every communication check to the frozen signature cue"));
}
var fileDigest = (model, filePath) => model?.digests?.[filePath] ?? sha256(model?.files?.[filePath] ?? "");
function computePrintSubjectDigest(model) {
  const records = Object.entries(model?.files ?? {}).filter(([filePath, value]) => typeof value === "string" && !RECEIPT_EXCLUDED_PATH.test(filePath)).sort(([left], [right]) => left.localeCompare(right)).map(([filePath]) => `${filePath}\0${fileDigest(model, filePath)}
`).join("");
  return sha256(records);
}
function printPdfPaths(model) {
  return [
    `dist/${model?.artifactId}.interior.proof.pdf`,
    `dist/${model?.artifactId}.interior.print.pdf`,
    `dist/${model?.artifactId}.cover.proof.pdf`,
    `dist/${model?.artifactId}.cover.print.pdf`
  ];
}
function printReviewCoveragePaths(model) {
  return [...printPdfPaths(model), ...Object.keys(EVIDENCE_SCHEMAS)].sort();
}
function printOutputPaths(model) {
  return [...printReviewCoveragePaths(model), "review.print.json", "release.manifest.json"];
}
function passingChecks(value) {
  const checks = asList(value?.checks).map(rec);
  return checks.length > 0 && checks.every((check) => check?.status === "pass" && typeof check.id === "string" && check.id.trim());
}
function validateEvidence(model, findings) {
  const files = model.files ?? {};
  const subjectDigest = computePrintSubjectDigest(model);
  for (const [filePath, schema] of Object.entries(EVIDENCE_SCHEMAS)) {
    let value;
    try {
      value = rec(JSON.parse(textOf(files[filePath])));
    } catch {
      value = void 0;
    }
    let valid = value?.schema === schema && value.artifactId === model.artifactId && value.subjectDigest === subjectDigest && value.verdict === "pass" && passingChecks(value);
    if (filePath === "evidence/fonts.json") {
      const fonts = asList(value?.fonts).map(rec);
      const typography = asList(value?.typography).map(rec);
      valid = valid && fonts.length > 0 && fonts.every((font) => typeof font?.family === "string" && font.family.trim() && font.embedded === true && font.glyphCoverage === true) && typography.length > 0 && typography.every((role) => typeof role?.role === "string" && typeof role.fontFamily === "string" && Number(role.fontSizePt) > 0 && Number(role.lineHeightPt) >= Number(role.fontSizePt) && Number.isFinite(Number(role.letterSpacingPt)) && Number(role.maxLineLength) > 0);
    } else if (filePath === "evidence/pagination.json") {
      valid = valid && Number.isInteger(value?.pages) && Number(value?.pages) > 0 && asList(value?.checks).map(rec).some((check) => check?.id === "widows-orphans" && check.status === "pass");
    } else if (filePath === "evidence/preflight.json") {
      valid = valid && typeof value?.printerProfile === "string" && value.printerProfile.trim().length > 0;
    }
    if (!valid) findings.push(finding("EVIDENCE_INVALID", filePath, `${filePath} must contain current passing business evidence`));
  }
}
function validateReleaseManifest(model, findings) {
  let manifest;
  try {
    manifest = rec(JSON.parse(textOf(model.files?.["release.manifest.json"])));
  } catch {
    manifest = void 0;
  }
  const expectedPaths = printReviewCoveragePaths(model);
  const outputs = asList(manifest?.outputs).map(rec);
  if (manifest?.schema !== RELEASE_MANIFEST_SCHEMA || manifest.plugin !== PLUGIN || manifest.artifactId !== model.artifactId || manifest.subjectDigest !== computePrintSubjectDigest(model) || outputs.length !== expectedPaths.length || outputs.some((entry, index) => entry?.path !== expectedPaths[index] || entry?.sha256 !== fileDigest(model, expectedPaths[index] ?? ""))) {
    findings.push(finding("RELEASE_MANIFEST_INVALID", "release.manifest.json", "release manifest must bind every current PDF and evidence digest"));
  }
}
function createPrintReceipt(model) {
  return {
    schemaVersion: 1,
    plugin: "print-publication-production",
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest: computePrintSubjectDigest(model),
    outputs: Object.fromEntries(printOutputPaths(model).map((filePath) => [filePath, fileDigest(model, filePath)]))
  };
}
function validatePrintReceipt(model) {
  try {
    const actual = JSON.parse(textOf(model?.files?.["receipt.release.json"]));
    const expected = createPrintReceipt(model);
    if (!isObject(actual)) return false;
    return actual.schemaVersion === expected.schemaVersion && actual.plugin === expected.plugin && actual.artifactId === expected.artifactId && actual.stage === expected.stage && actual.subjectDigest === expected.subjectDigest && JSON.stringify(actual.outputs) === JSON.stringify(expected.outputs);
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
    ".gitignore",
    "package.json",
    "package-lock.json",
    "plan.contract.json",
    "plan.assets.json",
    "print.project.json",
    "tsconfig.json",
    "vivliostyle.config.js",
    "src/render.tsx",
    "src/publication.manifest.json",
    "src/cover/Front.cover.tsx",
    "src/cover/Spine.cover.tsx",
    "src/cover/Back.cover.tsx",
    "src/styles/tokens.css",
    "src/styles/page.css",
    "src/styles/components.css",
    "src/styles/publication.css"
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
function validateUnit(files, filePath, findings) {
  const source = files[filePath];
  if (typeof source !== "string") {
    findings.push(finding("PUBLICATION_UNIT_MISSING", filePath, "publication unit is missing"));
    return;
  }
  if (UNIT_VIOLATION.test(source)) findings.push(finding("PUBLICATION_UNIT_VIOLATION", filePath, "publication units must be static React without client runtime, I/O, network, or nondeterminism"));
  if ((source.match(/export\s+function\s+[A-Za-z][A-Za-z0-9]*\s*\(/gu) ?? []).length !== 1) findings.push(finding("PUBLICATION_EXPORT_INVALID", filePath, "publication unit must export exactly one component"));
}
function validatePrintModel(model, { stage = "source" } = {}) {
  const findings = [];
  const files = model?.files ?? {};
  if (".print-delivery-journal.json" in files) findings.push(finding("MUTATION_JOURNAL_OPEN", ".print-delivery-journal.json", "an interrupted generated writer must be resumed or rolled back"));
  validateRequired(files, findings);
  validateArtifactGitignore(files, findings);
  const plan = rec(parseJson(files, "plan.contract.json", findings));
  if (!plan || plan.schema !== PLAN_SCHEMA || plan.artifactId !== model?.artifactId || !["source", "release"].includes(String(plan.targetStage)) || ["audience", "objective", "language"].some((key) => typeof plan[key] !== "string" || !String(plan[key]).trim())) findings.push(finding("PLAN_INVALID", "plan.contract.json", "print plan must bind schema, artifact, stage, audience, objective, and language"));
  if (rec(model?.project)?.artifactId !== model?.artifactId) findings.push(finding("ARTIFACT_ID_MISMATCH", "print.project.json", "project artifactId must match directory id"));
  const manifest = parseJson(files, "src/publication.manifest.json", findings);
  const sections = asList(rec(manifest)?.sections);
  if (!communicationCoreValid(plan?.communicationCore)) findings.push(finding("COMMUNICATION_CORE_INVALID", "plan.contract.json", "print plan must bind a complete communicationCore"));
  else {
    const allowed = new Set(sections.map((entry) => `section:${String(rec(entry)?.id ?? "")}`));
    if (communicationAnchors(plan?.communicationCore).some((anchor) => !allowed.has(anchor))) findings.push(finding("COMMUNICATION_CUE_UNBOUND", "plan.contract.json", "every print signature cue anchor must reference a current publication section"));
  }
  const ids = /* @__PURE__ */ new Set();
  let prior = -1;
  sections.forEach((entry) => {
    const item = rec(entry);
    const match = typeof item?.source === "string" ? item.source.match(SECTION_SOURCE) : null;
    const filePath = `src/sections/${item?.source ?? "manifest.json"}`;
    if (!match || Number(match.groups?.index) !== item?.index) findings.push(finding("SECTION_NAME_INVALID", filePath, "section source must use NNN-slug.section.tsx and match manifest index"));
    if (!Number.isInteger(item?.index) || Number(item?.index) <= prior || ids.has(item?.id)) findings.push(finding("SECTION_ORDER_INVALID", "src/publication.manifest.json", "section indexes must be unique and strictly increasing"));
    prior = item?.index;
    ids.add(item?.id);
    validateUnit(files, filePath, findings);
  });
  for (const cover of ["Front", "Spine", "Back"]) validateUnit(files, `src/cover/${cover}.cover.tsx`, findings);
  const pageCss = files["src/styles/page.css"];
  const renderTsx = files["src/render.tsx"];
  if (typeof pageCss === "string" && !/@page(?:\s|\{)/u.test(pageCss)) findings.push(finding("PAGED_MEDIA_MISSING", "src/styles/page.css", "page stylesheet must declare @page"));
  if (typeof renderTsx === "string" && !/renderPublication/u.test(renderTsx)) findings.push(finding("RENDER_OWNER_INVALID", "src/render.tsx", "render.tsx must own the static publication render"));
  if (stage === "release") {
    const outputs = printOutputPaths(model);
    const pdfs = printPdfPaths(model);
    for (const filePath of [...outputs, "receipt.release.json"]) {
      if (!(filePath in files)) findings.push(finding("RELEASE_PATH_MISSING", filePath, `${filePath} is required for release`));
    }
    for (const filePath of pdfs) {
      const pdf = files[filePath];
      if (typeof pdf === "string" && !pdf.startsWith("%PDF-")) findings.push(finding("PDF_MAGIC_INVALID", filePath, "PDF output must have PDF magic and be directly probed"));
    }
    validateEvidence(model, findings);
    validateReleaseManifest(model, findings);
    if ("receipt.release.json" in files && !validatePrintReceipt(model)) findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind current publication sources and outputs"));
    validateIndependentReviewFile(model, "review.print.json", findings);
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}
function evaluatePrintWrite({ relativePath = "", toolName = "", writer = "", cwd = "" } = {}) {
  const inside = projectInside(relativePath, cwd, "print");
  if (!inside) return { decision: "allow" };
  if (GENERATED_PATH.test(inside) && !writer.startsWith("print-")) return { decision: "deny", code: "PROTECTED_WRITER_REQUIRED", message: `${inside} must be written by a print guard tool, not ${toolName || "an unregistered tool"}` };
  return { decision: "allow" };
}

export {
  createPrintReceipt,
  validatePrintReceipt,
  validatePrintModel,
  evaluatePrintWrite
};
