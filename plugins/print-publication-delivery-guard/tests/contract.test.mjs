import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createPrintReceipt,
  evaluatePrintWrite,
  validatePrintModel,
  validatePrintReceipt,
} from "../scripts/lib/contract.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function validModel() {
  return {
    artifactId: "field-manual",
    files: {
      ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
      "package.json": "{}\n",
      "package-lock.json": "{}\n",
      "plan.contract.json": "{}\n",
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

test("accepts strictly increasing static publication sections", () => {
  assert.deepEqual(validatePrintModel(validModel(), { stage: "source" }), []);
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
  const model = validModel();
  Object.assign(model.files, {
    "dist/field-manual.interior.proof.pdf": "%PDF-proof-interior",
    "dist/field-manual.interior.print.pdf": "%PDF-print-interior",
    "dist/field-manual.cover.proof.pdf": "%PDF-proof-cover",
    "dist/field-manual.cover.print.pdf": "%PDF-print-cover",
    "evidence/pdf.json": "{}\n",
    "evidence/fonts.json": "{}\n",
    "evidence/images.json": "{}\n",
    "evidence/pagination.json": "{}\n",
    "evidence/preflight.json": "{}\n",
    "evidence.accessibility.json": "{}\n",
    "review.print.json": "{}\n",
    "release.manifest.json": "{}\n",
  });
  const receipt = createPrintReceipt(model);
  model.files["receipt.release.json"] = JSON.stringify(receipt);

  assert.equal(receipt.outputs["dist/field-manual.cover.print.pdf"], sha256("%PDF-print-cover"));
  assert.equal(validatePrintReceipt(model), true);
  model.files["src/styles/page.css"] += "@page chapter { margin: 15mm; }\n";
  assert.equal(validatePrintReceipt(model), false);
});
