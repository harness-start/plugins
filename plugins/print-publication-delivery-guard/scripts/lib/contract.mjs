import { createHash } from "node:crypto";

const SECTION_SOURCE = /^(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.section\.tsx$/u;
const GENERATED_PATH = /^(?:build\/html\/|dist\/|evidence(?:\/|\.[^/]+\.json$)|evidence\.accessibility\.json$|review\.print\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$)/u;
const UNIT_VIOLATION = /(?:\b(?:useState|useEffect|useLayoutEffect|useReducer|hydrateRoot|createRoot|createPortal|fetch|setTimeout|setInterval)\s*\(|from\s+["'](?:react-router|react-router-dom|node:fs|node:child_process)["']|https?:\/\/|\b(?:Date\.now|Math\.random)\s*\()/u;
const RECEIPT_EXCLUDED_PATH = /^(?:build\/|dist\/|evidence(?:\.|\/)|review\.print\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$|\.print-delivery-journal\.json$)/u;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const finding = (code, path, message) => ({ code, path, message });
const fileDigest = (model, filePath) => model?.digests?.[filePath] ?? sha256(model?.files?.[filePath] ?? "");

export function computePrintSubjectDigest(model) {
  const records = Object.entries(model?.files ?? {})
    .filter(([filePath, value]) => typeof value === "string" && !RECEIPT_EXCLUDED_PATH.test(filePath))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath]) => `${filePath}\0${fileDigest(model, filePath)}\n`)
    .join("");
  return sha256(records);
}

function printOutputPaths(model) {
  return [
    `dist/${model.artifactId}.interior.proof.pdf`, `dist/${model.artifactId}.interior.print.pdf`,
    `dist/${model.artifactId}.cover.proof.pdf`, `dist/${model.artifactId}.cover.print.pdf`,
    "evidence/pdf.json", "evidence/fonts.json", "evidence/images.json", "evidence/pagination.json",
    "evidence/preflight.json", "evidence.accessibility.json", "review.print.json", "release.manifest.json",
  ];
}

export function createPrintReceipt(model) {
  return {
    schemaVersion: 1,
    plugin: "print-publication-delivery-guard",
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest: computePrintSubjectDigest(model),
    outputs: Object.fromEntries(printOutputPaths(model).map((filePath) => [filePath, fileDigest(model, filePath)])),
  };
}

export function validatePrintReceipt(model) {
  try {
    const actual = JSON.parse(model?.files?.["receipt.release.json"] ?? "");
    const expected = createPrintReceipt(model);
    return actual?.schemaVersion === expected.schemaVersion
      && actual?.plugin === expected.plugin
      && actual?.artifactId === expected.artifactId
      && actual?.stage === expected.stage
      && actual?.subjectDigest === expected.subjectDigest
      && JSON.stringify(actual?.outputs) === JSON.stringify(expected.outputs);
  } catch {
    return false;
  }
}

function parseJson(files, filePath, findings) {
  if (typeof files[filePath] !== "string") {
    findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
    return null;
  }
  try { return JSON.parse(files[filePath]); } catch {
    findings.push(finding("JSON_INVALID", filePath, `${filePath} must contain valid JSON`));
    return null;
  }
}

function validateRequired(files, findings) {
  for (const filePath of [
    ".gitignore", "package.json", "package-lock.json", "plan.contract.json", "plan.assets.json",
    "print.project.json", "tsconfig.json", "vivliostyle.config.js", "src/render.tsx",
    "src/publication.manifest.json", "src/cover/Front.cover.tsx", "src/cover/Spine.cover.tsx",
    "src/cover/Back.cover.tsx", "src/styles/tokens.css", "src/styles/page.css",
    "src/styles/components.css", "src/styles/publication.css",
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
  if (typeof source !== "string") { findings.push(finding("PUBLICATION_UNIT_MISSING", filePath, "publication unit is missing")); return; }
  if (UNIT_VIOLATION.test(source)) findings.push(finding("PUBLICATION_UNIT_VIOLATION", filePath, "publication units must be static React without client runtime, I/O, network, or nondeterminism"));
  if ((source.match(/export\s+function\s+[A-Za-z][A-Za-z0-9]*\s*\(/gu) ?? []).length !== 1) findings.push(finding("PUBLICATION_EXPORT_INVALID", filePath, "publication unit must export exactly one component"));
}

export function validatePrintModel(model, { stage = "source" } = {}) {
  const findings = [];
  const files = model?.files ?? {};
  if (".print-delivery-journal.json" in files) findings.push(finding("MUTATION_JOURNAL_OPEN", ".print-delivery-journal.json", "an interrupted generated writer must be resumed or rolled back"));
  validateRequired(files, findings);
  validateArtifactGitignore(files, findings);
  if (model?.project?.artifactId !== model?.artifactId) findings.push(finding("ARTIFACT_ID_MISMATCH", "print.project.json", "project artifactId must match directory id"));
  const manifest = parseJson(files, "src/publication.manifest.json", findings);
  const sections = Array.isArray(manifest?.sections) ? manifest.sections : [];
  const ids = new Set();
  let prior = -1;
  sections.forEach((entry) => {
    const match = typeof entry?.source === "string" ? entry.source.match(SECTION_SOURCE) : null;
    const filePath = `src/sections/${entry?.source ?? "manifest.json"}`;
    if (!match || Number(match.groups.index) !== entry.index) findings.push(finding("SECTION_NAME_INVALID", filePath, "section source must use NNN-slug.section.tsx and match manifest index"));
    if (!Number.isInteger(entry?.index) || entry.index <= prior || ids.has(entry?.id)) findings.push(finding("SECTION_ORDER_INVALID", "src/publication.manifest.json", "section indexes must be unique and strictly increasing"));
    prior = entry?.index;
    ids.add(entry?.id);
    validateUnit(files, filePath, findings);
  });
  for (const cover of ["Front", "Spine", "Back"]) validateUnit(files, `src/cover/${cover}.cover.tsx`, findings);
  if (typeof files["src/styles/page.css"] === "string" && !/@page(?:\s|\{)/u.test(files["src/styles/page.css"])) findings.push(finding("PAGED_MEDIA_MISSING", "src/styles/page.css", "page stylesheet must declare @page"));
  if (typeof files["src/render.tsx"] === "string" && !/renderPublication/u.test(files["src/render.tsx"])) findings.push(finding("RENDER_OWNER_INVALID", "src/render.tsx", "render.tsx must own the static publication render"));
  if (stage === "release") {
    const outputs = printOutputPaths(model);
    const pdfs = outputs.filter((filePath) => filePath.endsWith(".pdf"));
    for (const filePath of [...outputs, "receipt.release.json"]) {
      if (!(filePath in files)) findings.push(finding("RELEASE_PATH_MISSING", filePath, `${filePath} is required for release`));
    }
    for (const filePath of pdfs) if (typeof files[filePath] === "string" && !files[filePath].startsWith("%PDF-")) findings.push(finding("PDF_MAGIC_INVALID", filePath, "PDF output must have PDF magic and be directly probed"));
    if ("receipt.release.json" in files && !validatePrintReceipt(model)) findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind current publication sources and outputs"));
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}

export function evaluatePrintWrite({ relativePath = "", toolName = "", writer = "" } = {}) {
  const normalized = relativePath.replaceAll("\\", "/");
  const match = normalized.match(/(?:^|\/)artifacts\/print\/[^/]+\/(?<inside>.+)$/u);
  if (!match) return { decision: "allow" };
  const inside = match.groups.inside;
  if (GENERATED_PATH.test(inside) && !writer.startsWith("print-")) return { decision: "deny", code: "PROTECTED_WRITER_REQUIRED", message: `${inside} must be written by a print guard tool, not ${toolName || "an unregistered tool"}` };
  return { decision: "allow" };
}
