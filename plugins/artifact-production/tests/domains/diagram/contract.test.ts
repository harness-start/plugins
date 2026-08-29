import assert from "node:assert/strict";
import test from "node:test";

import {
  DIAGRAM_TYPES,
  inspectDiagramSvg,
  validateDiagramModel,
  type DiagramModel,
} from "../../../src/domains/diagram/lib/contract.js";

const sourceModel = (): DiagramModel => ({
  artifactId: "service-flow",
  files: {
    ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
    "package.json": "{}\n",
    "package-lock.json": "{}\n",
    "plan.contract.json": JSON.stringify({
      schema: "diagram-production/plan/v1",
      artifactId: "service-flow",
      targetStage: "release",
      audience: "engineering",
      objective: "explain request flow",
      language: "zh-CN",
    }),
    "design.system.json": JSON.stringify({
      schema: "diagram-production/design-system/v1",
      canvas: { width: 1600, height: 900, background: "#F8FAFC" },
      colors: { primary: "#2563EB", accent: "#0F766E", text: "#0F172A", muted: "#475569", surface: "#FFFFFF", line: "#94A3B8" },
      typography: { sans: "Noto Sans SC", serif: "Noto Serif SC", basePx: 20 },
      spacing: { gridPx: 4, nodeGapPx: 48, layerGapPx: 88 },
    }),
    "diagram.project.json": JSON.stringify({
      schema: "diagram-production/project/v1",
      artifactId: "service-flow",
      source: "src/diagram.json",
      designSystem: "design.system.json",
      outputs: ["svg", "png", "html", "drawio"],
    }),
    "src/diagram.json": JSON.stringify({
      schema: "diagram-production/source/v1",
      type: "flowchart",
      title: "Request flow",
      nodes: [
        { id: "client", label: "Client" },
        { id: "api", label: "API" },
      ],
      edges: [{ from: "client", to: "api", label: "request" }],
    }),
  },
});

test("publishes exactly the 27 diagram types promised by the plugin", () => {
  assert.equal(DIAGRAM_TYPES.length, 27);
  assert.deepEqual(new Set(DIAGRAM_TYPES).size, 27);
  assert.ok(DIAGRAM_TYPES.includes("architecture"));
  assert.ok(DIAGRAM_TYPES.includes("dp-security-matrix"));
});

test("accepts a valid source-stage diagram project", () => {
  assert.deepEqual(validateDiagramModel(sourceModel(), { stage: "source" }), []);
});

test("classifies relative references and CSS imports as unsafe SVG", () => {
  assert.equal(inspectDiagramSvg(`<svg xmlns="http://www.w3.org/2000/svg"><image href="local.png"/></svg>`).unsafe, true);
  assert.equal(inspectDiagramSvg(`<svg xmlns="http://www.w3.org/2000/svg"><style>@import url("theme.css");</style></svg>`).unsafe, true);
  assert.equal(inspectDiagramSvg(`<svg xmlns="http://www.w3.org/2000/svg"><use href="#icon"/></svg>`).unsafe, false);
});

test("rejects an unsupported diagram type", () => {
  const model = sourceModel();
  const source = JSON.parse(String(model.files?.["src/diagram.json"]));
  source.type = "sankey";
  model.files!["src/diagram.json"] = JSON.stringify(source);
  assert.ok(validateDiagramModel(model, { stage: "source" }).some(({ code }) => code === "DIAGRAM_TYPE_UNSUPPORTED"));
});

test("rejects a malformed import fidelity ledger when one is present", () => {
  const model = sourceModel();
  model.files!["plan.import-ledger.json"] = JSON.stringify({ schema: "diagram-production/import-ledger/v1", sourceFormat: "drawio", preserved: "labels" });
  assert.ok(validateDiagramModel(model, { stage: "source" }).some(({ code }) => code === "IMPORT_LEDGER_INVALID"));
});

test("accepts a source contract for every published diagram type", () => {
  const quantitative = new Set(["bar", "line", "scatter", "radar", "quadrant", "gantt", "timeline", "venn", "pyramid"]);
  for (const type of DIAGRAM_TYPES) {
    const model = sourceModel();
    const source = JSON.parse(String(model.files?.["src/diagram.json"]));
    source.type = type;
    if (quantitative.has(type)) {
      delete source.nodes; delete source.edges;
      source.data = [{ id: "one", label: "One", value: 1 }, { id: "two", label: "Two", value: 2 }];
    }
    model.files!["src/diagram.json"] = JSON.stringify(source);
    assert.deepEqual(validateDiagramModel(model, { stage: "source" }), [], type);
  }
});
