import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  computePrintSubjectDigest,
  createPrintReceipt,
  evaluatePrintWrite,
  validatePrintModel,
  validatePrintReceipt,
} from "../../../src/domains/print/lib/contract.js";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function validModel() {
  return {
    artifactId: "field-manual",
    files: {
      ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
      "package.json": "{}\n",
      "package-lock.json": "{}\n",
      "plan.contract.json": JSON.stringify({ schema: "print-publication-production/plan/v1", artifactId: "field-manual", targetStage: "release", audience: "field operators", objective: "explain the operating procedure", language: "en", communicationCore: { coreIntent: "Make the operating sequence easy to recover.", audienceOutcome: "Field operators can locate and repeat the procedure.", retellTarget: "Follow the field procedure in order.", signatureCue: { description: "The feature section hierarchy", semanticRole: "Primary operating sequence", anchors: ["section:feature"] }, semanticLink: "The publication hierarchy makes the required sequence observable.", invariants: ["procedure order remains stable across cover and interior"], prohibitedDrift: ["decorative cover language that contradicts the interior hierarchy"] } }),
      "plan.assets.json": "{}\n",
      "print.project.json": "{}\n",
      "tsconfig.json": "{}\n",
      "vivliostyle.config.js": "export default { title: 'Field Manual' };\n",
      "src/render.tsx": "export function renderPublication(){ return '<html></html>'; }\n",
      "src/publication.manifest.json": JSON.stringify({ sections: [{ index: 10, id: "toc", role: "toc", source: "010-toc.section.tsx" }, { index: 20, id: "feature", role: "article", source: "020-feature.section.tsx" }] }),
      "src/cover/Front.cover.tsx": "export function Front(){return <section><h1>Field Manual</h1></section>;}\n",
      "src/cover/Spine.cover.tsx": "export function Spine(){return <section>Field Manual</section>;}\n",
      "src/cover/Back.cover.tsx": "export function Back(){return <section>Back</section>;}\n",
      "src/sections/010-toc.section.tsx": "export function Toc(){return <nav><h1>Contents</h1></nav>;}\n",
      "src/sections/020-feature.section.tsx": "export function Feature(){return <article><h1>Feature</h1></article>;}\n",
      "src/styles/tokens.css": ":root{--space:8pt;}\n",
      "src/styles/page.css": "@page { size: A4; margin: 12mm; }\n",
      "src/styles/components.css": "article{break-inside:avoid;}\n",
      "src/styles/publication.css": "@import './page.css';\n",
    },
    project: { artifactId: "field-manual", publicationManifest: "src/publication.manifest.json", targets: ["cover", "interior"] },
  };
}

function releaseModel() {
  const model = validModel();
  const subjectDigest = computePrintSubjectDigest(model);
  Object.assign(model.files, {
    "dist/field-manual.interior.proof.pdf": "%PDF-proof-interior",
    "dist/field-manual.interior.print.pdf": "%PDF-print-interior",
    "dist/field-manual.cover.proof.pdf": "%PDF-proof-cover",
    "dist/field-manual.cover.print.pdf": "%PDF-print-cover",
    "evidence/pdf.json": JSON.stringify({ schema: "print-publication-production/pdf-evidence/v1", artifactId: model.artifactId, subjectDigest, verdict: "pass", checks: [{ id: "pdf-structure", status: "pass" }] }),
    "evidence/fonts.json": JSON.stringify({ schema: "print-publication-production/fonts-evidence/v1", artifactId: model.artifactId, subjectDigest, verdict: "pass", fonts: [{ family: "Source Sans 3", embedded: true, glyphCoverage: true }], typography: [{ role: "body", fontFamily: "Source Sans 3", fontSizePt: 10, lineHeightPt: 14, letterSpacingPt: 0, maxLineLength: 72 }] }),
    "evidence/images.json": JSON.stringify({ schema: "print-publication-production/images-evidence/v1", artifactId: model.artifactId, subjectDigest, verdict: "pass", checks: [{ id: "image-resolution", status: "pass" }] }),
    "evidence/pagination.json": JSON.stringify({ schema: "print-publication-production/pagination-evidence/v1", artifactId: model.artifactId, subjectDigest, verdict: "pass", pages: 8, checks: [{ id: "widows-orphans", status: "pass" }] }),
    "evidence/preflight.json": JSON.stringify({ schema: "print-publication-production/preflight-evidence/v1", artifactId: model.artifactId, subjectDigest, verdict: "pass", printerProfile: "ISO Coated v2", checks: [{ id: "trim-bleed-fonts", status: "pass" }] }),
    "evidence.accessibility.json": JSON.stringify({ schema: "print-publication-production/accessibility-evidence/v1", artifactId: model.artifactId, subjectDigest, verdict: "pass", checks: [{ id: "reading-order", status: "pass" }] }),
  });
  const coverage = Object.keys(model.files)
    .filter((path) => path.startsWith("dist/") || path.startsWith("evidence/" ) || path === "evidence.accessibility.json")
    .sort()
    .map((path) => ({ path, sha256: sha256(model.files[path]) }));
  model.files["review.print.json"] = JSON.stringify({ schema: "print-publication-production/review/v3", plugin: "print-publication-production", artifactId: model.artifactId, subjectDigest, verdict: "pass", reviewer: { kind: "independent-agent", id: "reviewer-1", sessionId: "print-review-session" }, coverage, checks: [{ id: "typography", status: "pass" }, { id: "pagination", status: "pass" }, { id: "preflight", status: "pass" }], reviewerRetell: { observedBeforeContract: "Follow the field procedure in order.", intendedTarget: "Follow the field procedure in order.", alignment: "pass", limitation: "Independent reviewer proxy; not a human recall study." }, communicationReview: Object.fromEntries(["coreFidelity", "signatureCue", "semanticCausality", "retellAlignment", "invariantContinuity"].map((key) => [key, { status: "pass", anchor: "section:feature", evidence: `${key} is visible in the reviewed publication.`, recovery: `Revise ${key} and repeat review.` }])) });
  model.files["release.manifest.json"] = JSON.stringify({ schema: "print-publication-production/release-manifest/v2", plugin: "print-publication-production", artifactId: model.artifactId, subjectDigest, outputs: coverage });
  model.files["receipt.release.json"] = JSON.stringify(createPrintReceipt(model));
  return model;
}

test("accepts strictly increasing static publication sections", () => {
  assert.deepEqual(validatePrintModel(validModel(), { stage: "source" }), []);
});

test("requires a publication communication core bound to a real section", () => {
  const missing = validModel();
  const missingPlan = JSON.parse(missing.files["plan.contract.json"]);
  delete missingPlan.communicationCore;
  missing.files["plan.contract.json"] = JSON.stringify(missingPlan);
  assert.ok(validatePrintModel(missing, { stage: "source" }).some(({ code }) => code === "COMMUNICATION_CORE_INVALID"));

  const unbound = validModel();
  const unboundPlan = JSON.parse(unbound.files["plan.contract.json"]);
  unboundPlan.communicationCore.signatureCue.anchors = ["section:missing"];
  unbound.files["plan.contract.json"] = JSON.stringify(unboundPlan);
  assert.ok(validatePrintModel(unbound, { stage: "source" }).some(({ code }) => code === "COMMUNICATION_CUE_UNBOUND"));
});

test("release requires a two-pass communication review", () => {
  const model = releaseModel();
  const review = JSON.parse(model.files["review.print.json"]);
  delete review.communicationReview.signatureCue;
  model.files["review.print.json"] = JSON.stringify(review);
  assert.ok(validatePrintModel(model, { stage: "release" }).some(({ code }) => code === "COMMUNICATION_REVIEW_INVALID"));

  const unbound = releaseModel();
  const unboundReview = JSON.parse(unbound.files["review.print.json"]);
  unboundReview.communicationReview.signatureCue.anchor = "section:missing";
  unbound.files["review.print.json"] = JSON.stringify(unboundReview);
  assert.ok(validatePrintModel(unbound, { stage: "release" }).some(({ code }) => code === "COMMUNICATION_REVIEW_INVALID"));
});

test("rejects client React inside a publication section", () => {
  const model = validModel();
  model.files["src/sections/020-feature.section.tsx"] = "export function Feature(){useEffect(()=>{}); return <article/>;}\n";

  assert.ok(validatePrintModel(model, { stage: "source" }).some(({ code }) => code === "PUBLICATION_UNIT_VIOLATION"));
});

test("rejects duplicate or decreasing section order", () => {
  const model = validModel();
  model.files["src/publication.manifest.json"] = JSON.stringify({ sections: [{ index: 20, id: "feature", role: "article", source: "020-feature.section.tsx" }, { index: 10, id: "toc", role: "toc", source: "010-toc.section.tsx" }] });

  assert.ok(validatePrintModel(model, { stage: "source" }).some(({ code }) => code === "SECTION_ORDER_INVALID"));
});

test("denies direct HTML and PDF writes but allows section source", () => {
  assert.equal(evaluatePrintWrite({ relativePath: "artifacts/print/manual/build/html/interior/index.html", toolName: "Write" }).decision, "deny");
  assert.equal(evaluatePrintWrite({ relativePath: "artifacts/print/manual/dist/manual.interior.print.pdf", toolName: "Write" }).decision, "deny");
  assert.deepEqual(evaluatePrintWrite({ relativePath: "artifacts/print/manual/src/sections/020-feature.section.tsx", toolName: "apply_patch" }), { decision: "allow" });
});

test("release receipt binds publication sources, PDFs, and preflight evidence", () => {
  const model = releaseModel();
  const receipt = createPrintReceipt(model);
  model.files["receipt.release.json"] = JSON.stringify(receipt);

  assert.equal(receipt.outputs["dist/field-manual.cover.print.pdf"], sha256("%PDF-print-cover"));
  assert.equal(validatePrintReceipt(model), true);
  model.files["src/styles/page.css"] += "@page chapter { margin: 15mm; }\n";
  assert.equal(validatePrintReceipt(model), false);
});

test("release rejects stale review coverage after a PDF changes even when the receipt is reissued", () => {
  const model = releaseModel();
  model.files["dist/field-manual.interior.print.pdf"] = "%PDF-mutated-after-review";
  model.files["receipt.release.json"] = JSON.stringify(createPrintReceipt(model));

  assert.ok(validatePrintModel(model, { stage: "release" }).some(({ code }) => code === "REVIEW_COVERAGE_INVALID"));
});

test("release rejects empty business evidence and an unbound release manifest", () => {
  const model = releaseModel();
  model.files["evidence/fonts.json"] = "{}";
  model.files["release.manifest.json"] = "{}";
  model.files["receipt.release.json"] = JSON.stringify(createPrintReceipt(model));

  const codes = new Set(validatePrintModel(model, { stage: "release" }).map(({ code }) => code));
  assert.ok(codes.has("EVIDENCE_INVALID"));
  assert.ok(codes.has("RELEASE_MANIFEST_INVALID"));
});
