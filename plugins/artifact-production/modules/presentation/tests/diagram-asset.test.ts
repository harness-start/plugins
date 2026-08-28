import assert from "node:assert/strict";
import test from "node:test";

import { strFromU8, unzipSync, zipSync } from "fflate";

import { inspectPptxPackage, validatePptxModel } from "../src/lib/contract.js";
import { minimalPptx, sha256, sourceModel } from "./fixture.js";

const SAFE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#fff"/><text x="80" y="120">Service flow</text></svg>`;

function diagramModel() {
  const model = sourceModel();
  const storyboard = JSON.parse(String(model.files!["plan.storyboard.json"]));
  storyboard.slides[0].visualType = "diagram";
  storyboard.slides[0].diagram = {
    asset: "assets/diagrams/service-flow.svg",
    sha256: sha256(SAFE_SVG),
    fit: "contain",
    takeaway: "Requests pass through the API.",
    alt: "Client connected to API by a request arrow.",
  };
  model.files!["plan.storyboard.json"] = JSON.stringify(storyboard);
  model.files!["assets/diagrams/service-flow.svg"] = SAFE_SVG;
  return model;
}

test("accepts a hash-bound local SVG diagram asset", () => {
  assert.deepEqual(validatePptxModel(diagramModel(), { stage: "source" }), []);
});

test("requires diagram metadata when visualType is diagram", () => {
  const model = diagramModel();
  const storyboard = JSON.parse(String(model.files!["plan.storyboard.json"]));
  delete storyboard.slides[0].diagram;
  model.files!["plan.storyboard.json"] = JSON.stringify(storyboard);
  assert.ok(validatePptxModel(model, { stage: "source" }).some(({ code }) => code === "DIAGRAM_ASSET_INVALID"));
});

test("rejects scriptable or externally linked SVG diagram assets", () => {
  const model = diagramModel();
  const unsafe = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://example.com/a.png"/></svg>`;
  model.files!["assets/diagrams/service-flow.svg"] = unsafe;
  const storyboard = JSON.parse(String(model.files!["plan.storyboard.json"]));
  storyboard.slides[0].diagram.sha256 = sha256(unsafe);
  model.files!["plan.storyboard.json"] = JSON.stringify(storyboard);
  assert.ok(validatePptxModel(model, { stage: "source" }).some(({ code }) => code === "DIAGRAM_ASSET_UNSAFE"));
});

test("rejects relative file references and CSS imports in SVG diagram assets", () => {
  for (const unsafe of [
    `<svg xmlns="http://www.w3.org/2000/svg"><image href="local.png"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg"><style>@import url("theme.css");</style></svg>`,
  ]) {
    const model = diagramModel();
    model.files!["assets/diagrams/service-flow.svg"] = unsafe;
    const storyboard = JSON.parse(String(model.files!["plan.storyboard.json"]));
    storyboard.slides[0].diagram.sha256 = sha256(unsafe);
    model.files!["plan.storyboard.json"] = JSON.stringify(storyboard);
    assert.ok(validatePptxModel(model, { stage: "source" }).some(({ code }) => code === "DIAGRAM_ASSET_UNSAFE"));
  }
});

test("PPTX inspection reports exact embedded SVG media digests", () => {
  const files = unzipSync(minimalPptx());
  const relsPath = "ppt/slides/_rels/slide1.xml.rels";
  const rels = strFromU8(files[relsPath]!).replace("</Relationships>", `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.svg"/></Relationships>`);
  files[relsPath] = Buffer.from(rels);
  files["ppt/media/image1.svg"] = Buffer.from(SAFE_SVG);
  const inspection = inspectPptxPackage(Buffer.from(zipSync(files))) as unknown as { media: Array<{ path: string; sha256: string }> };
  assert.deepEqual(inspection.media, [{ path: "ppt/media/image1.svg", sha256: sha256(SAFE_SVG) }]);
});
