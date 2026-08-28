import assert from "node:assert/strict";
import test from "node:test";

import { renderDiagram } from "../src/lib/render.js";
import { DIAGRAM_TYPES } from "../src/lib/contract.js";

const design = {
  canvas: { width: 1600, height: 900, background: "#F8FAFC" },
  colors: { primary: "#2563EB", accent: "#0F766E", text: "#0F172A", muted: "#475569", surface: "#FFFFFF", line: "#94A3B8" },
  typography: { sans: "Noto Sans SC", serif: "Noto Serif SC", basePx: 20 },
  spacing: { gridPx: 4, nodeGapPx: 48, layerGapPx: 88 },
};

test("renders deterministic self-contained SVG, HTML, and editable draw.io", async () => {
  const source = { schema: "diagram-production/source/v1", type: "flowchart", title: "Request flow", nodes: [{ id: "client", label: "Client" }, { id: "api", label: "API" }], edges: [{ from: "client", to: "api", label: "request" }] };
  const first = await renderDiagram(source, design);
  const second = await renderDiagram(source, design);
  assert.equal(first.svg, second.svg);
  assert.match(first.svg, /^<svg/u);
  assert.doesNotMatch(first.svg, /(?:href|src)=["']https?:\/\//u);
  assert.match(first.html, /^<!doctype html>/u);
  assert.match(first.drawio, /<mxGraphModel/u);
  assert.equal(first.scene.elements.filter(({ kind }) => kind === "node").length, 2);
});

test("renders every published static diagram type", async () => {
  const quantitative = new Set(["bar", "line", "scatter", "radar", "quadrant", "gantt", "timeline", "venn", "pyramid"]);
  for (const type of DIAGRAM_TYPES) {
    const source = quantitative.has(type)
      ? { type, title: type, data: [{ id: "a", label: "A", value: 2 }, { id: "b", label: "B", value: 5 }] }
      : { type, title: type, nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b" }] };
    const result = await renderDiagram(source, design);
    assert.match(result.svg, new RegExp(`<text[^>]*>${type}</text>`, "u"), type);
    assert.ok(result.scene.elements.length > 0, type);
  }
});
