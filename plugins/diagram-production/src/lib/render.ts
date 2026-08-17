import type { JsonRecord } from "./contract.js";

export type SceneNode = { kind: "node"; id: string; label: string; x: number; y: number; width: number; height: number; role?: string };
export type SceneEdge = { kind: "edge"; id: string; from: string; to: string; label?: string; points: Array<{ x: number; y: number }> };
export type SceneShape = { kind: "shape"; id: string; shape: "circle" | "bar" | "line" | "area"; x: number; y: number; width: number; height: number; label?: string; value?: number; role?: string };
export type SceneElement = SceneNode | SceneEdge | SceneShape;
export type SceneModel = { width: number; height: number; title: string; type: string; elements: SceneElement[] };
type Design = { canvas: { width: number; height: number; background: string }; colors: { primary: string; accent: string; text: string; muted: string; surface: string; line: string }; typography: { sans: string; serif: string; basePx: number }; spacing: { gridPx: number; nodeGapPx: number; layerGapPx: number } };
type RenderResult = { scene: SceneModel; svg: string; html: string; drawio: string };
type ElkEngine = { layout(graph: Record<string, unknown>): Promise<Record<string, unknown>> };

const rec = (value: unknown): JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const escapeXml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const number = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const snap = (value: number, grid: number) => Math.round(value / grid) * grid;
const identifier = (value: unknown, index: number) => String(value ?? `item-${index + 1}`);

function sourceNodes(source: JsonRecord) {
  const candidates = list(source.nodes).length ? list(source.nodes) : list(source.items).length ? list(source.items) : list(source.data);
  return candidates.map((value, index) => { const item = rec(value); return { id: identifier(item.id, index), label: String(item.label ?? item.name ?? item.title ?? `Item ${index + 1}`), value: number(item.value, index + 1) }; });
}

function graphScene(source: JsonRecord, design: Design): SceneElement[] {
  const nodes = sourceNodes(source); const count = nodes.length; const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(count))));
  const nodeWidth = snap(Math.min(260, (design.canvas.width - 160 - (columns - 1) * design.spacing.nodeGapPx) / columns), design.spacing.gridPx);
  const nodeHeight = 96; const startY = 160;
  const laidOut: SceneNode[] = nodes.map((node, index) => {
    const column = index % columns; const row = Math.floor(index / columns);
    return { kind: "node", id: node.id, label: node.label, x: snap(80 + column * (nodeWidth + design.spacing.nodeGapPx), design.spacing.gridPx), y: snap(startY + row * (nodeHeight + design.spacing.layerGapPx), design.spacing.gridPx), width: nodeWidth, height: nodeHeight, role: index === 0 ? "primary" : "default" };
  });
  const byId = new Map(laidOut.map((node) => [node.id, node]));
  const edges: SceneEdge[] = list(source.edges).map((value, index) => {
    const edge = rec(value); const from = String(edge.from ?? ""); const to = String(edge.to ?? ""); const left = byId.get(from); const right = byId.get(to);
    const points = left && right ? [{ x: left.x + left.width, y: left.y + left.height / 2 }, { x: (left.x + left.width + right.x) / 2, y: left.y + left.height / 2 }, { x: (left.x + left.width + right.x) / 2, y: right.y + right.height / 2 }, { x: right.x, y: right.y + right.height / 2 }] : [];
    return { kind: "edge" as const, id: `edge-${index + 1}`, from, to, ...(edge.label ? { label: String(edge.label) } : {}), points };
  }).filter((edge) => edge.points.length > 0);
  return [...edges, ...laidOut];
}

function sequenceScene(source: JsonRecord, design: Design): SceneElement[] {
  const nodes = sourceNodes(source); const usable = design.canvas.width - 160; const width = Math.min(220, usable / Math.max(nodes.length, 1) - 24);
  const actors: SceneNode[] = nodes.map((node, index) => ({ kind: "node", id: node.id, label: node.label, x: 80 + index * (usable / Math.max(nodes.length, 1)), y: 148, width, height: 68, role: "actor" }));
  const positions = new Map(actors.map((node) => [node.id, node]));
  const messages: SceneEdge[] = list(source.edges).map((value, index) => { const edge = rec(value); const from = String(edge.from ?? ""); const to = String(edge.to ?? ""); const left = positions.get(from); const right = positions.get(to); const y = 280 + index * 74; return { kind: "edge" as const, id: `message-${index + 1}`, from, to, ...(edge.label ? { label: String(edge.label) } : {}), points: left && right ? [{ x: left.x + left.width / 2, y }, { x: right.x + right.width / 2, y }] : [] }; }).filter((edge) => edge.points.length > 0);
  return [...messages, ...actors];
}

function quantitativeScene(source: JsonRecord, design: Design): SceneElement[] {
  const items = sourceNodes(source); const values = items.map(({ value }) => value); const maximum = Math.max(...values, 1); const left = 128; const top = 188; const width = design.canvas.width - 232; const height = design.canvas.height - 300;
  if (source.type === "venn") return items.slice(0, 4).map((item, index) => ({ kind: "shape" as const, id: item.id, shape: "circle" as const, x: left + index * 150, y: top + (index % 2) * 96, width: 320, height: 320, label: item.label, role: index % 2 ? "accent" : "primary" }));
  if (source.type === "pyramid") return items.map((item, index) => { const scale = 1 - index / Math.max(items.length * 1.4, 2); const itemWidth = width * scale; return { kind: "shape" as const, id: item.id, shape: "area" as const, x: left + (width - itemWidth) / 2, y: top + index * (height / Math.max(items.length, 1)), width: itemWidth, height: height / Math.max(items.length, 1) - 8, label: item.label, value: item.value }; });
  if (["line", "scatter", "radar", "quadrant"].includes(String(source.type))) return items.map((item, index) => ({ kind: "shape" as const, id: item.id, shape: "circle" as const, x: left + index * (width / Math.max(items.length - 1, 1)) - 10, y: top + height - item.value / maximum * height - 10, width: 20, height: 20, label: item.label, value: item.value, role: index % 2 ? "accent" : "primary" }));
  return items.map((item, index) => { const slot = width / Math.max(items.length, 1); const barHeight = item.value / maximum * height; return { kind: "shape" as const, id: item.id, shape: "bar" as const, x: left + index * slot + slot * 0.14, y: top + height - barHeight, width: slot * 0.72, height: barHeight, label: item.label, value: item.value, role: index % 2 ? "accent" : "primary" }; });
}

async function applyElk(elements: SceneElement[], source: JsonRecord, design: Design, elk: ElkEngine) {
  const nodes = elements.filter((entry): entry is SceneNode => entry.kind === "node");
  const edges = elements.filter((entry): entry is SceneEdge => entry.kind === "edge");
  const graph = await elk.layout({
    id: "root",
    layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT", "elk.edgeRouting": "ORTHOGONAL", "elk.spacing.nodeNode": String(design.spacing.nodeGapPx), "elk.layered.spacing.nodeNodeBetweenLayers": String(design.spacing.layerGapPx) },
    children: nodes.map((node) => ({ id: node.id, width: node.width, height: node.height })),
    edges: edges.map((edge) => ({ id: edge.id, sources: [edge.from], targets: [edge.to] })),
  });
  const laidNodes = Array.isArray(graph.children) ? graph.children.map(rec) : [];
  const byId = new Map(laidNodes.map((node) => [String(node.id), node]));
  for (const node of nodes) { const layout = byId.get(node.id); if (layout) { node.x = snap(80 + number(layout.x, node.x), design.spacing.gridPx); node.y = snap(156 + number(layout.y, node.y), design.spacing.gridPx); } }
  const laidEdges = new Map((Array.isArray(graph.edges) ? graph.edges.map(rec) : []).map((edge) => [String(edge.id), edge]));
  for (const edge of edges) {
    const sections = list(laidEdges.get(edge.id)?.sections); const section = rec(sections[0]); const start = rec(section.startPoint); const end = rec(section.endPoint); const bends = list(section.bendPoints).map(rec);
    if (Object.keys(start).length && Object.keys(end).length) edge.points = [start, ...bends, end].map((point) => ({ x: snap(80 + number(point.x, 0), design.spacing.gridPx), y: snap(156 + number(point.y, 0), design.spacing.gridPx) }));
  }
}

async function buildScene(source: JsonRecord, design: Design, elk?: ElkEngine): Promise<SceneModel> {
  const type = String(source.type ?? "flowchart");
  const quantitative = ["bar", "line", "scatter", "radar", "quadrant", "gantt", "timeline", "venn", "pyramid"].includes(type);
  const elements = type === "sequence" ? sequenceScene(source, design) : quantitative ? quantitativeScene(source, design) : graphScene(source, design);
  if (elk && type !== "sequence" && !quantitative) await applyElk(elements, source, design, elk);
  return { width: design.canvas.width, height: design.canvas.height, title: String(source.title ?? "Diagram"), type, elements };
}

function textLines(label: string, width: number) {
  const maximum = Math.max(6, Math.floor(width / 15)); const words = [...label]; const lines: string[] = [];
  while (words.length && lines.length < 3) lines.push(words.splice(0, maximum).join(""));
  if (words.length && lines.length) lines[lines.length - 1] = `${lines.at(-1)?.slice(0, -1) ?? ""}…`;
  return lines;
}

function sceneToSvg(scene: SceneModel, design: Design, embeddedFontCss = "") {
  const byId = new Map(scene.elements.filter((entry): entry is SceneNode => entry.kind === "node").map((node) => [node.id, node]));
  const content = scene.elements.map((element) => {
    if (element.kind === "edge") {
      const points = element.points.map(({ x, y }) => `${snap(x, design.spacing.gridPx)},${snap(y, design.spacing.gridPx)}`).join(" "); const middle = element.points[Math.floor(element.points.length / 2)];
      return `<g data-kind="edge" data-id="${escapeXml(element.id)}"><polyline points="${points}" fill="none" stroke="${escapeXml(design.colors.line)}" stroke-width="3" stroke-linejoin="round" marker-end="url(#arrow)"/>${element.label && middle ? `<text x="${middle.x}" y="${middle.y - 10}" text-anchor="middle" class="edge-label">${escapeXml(element.label)}</text>` : ""}</g>`;
    }
    if (element.kind === "node") {
      const fill = element.role === "primary" ? design.colors.primary : design.colors.surface; const text = element.role === "primary" ? "#FFFFFF" : design.colors.text; const lines = textLines(element.label, element.width);
      return `<g data-kind="node" data-id="${escapeXml(element.id)}"><rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="18" fill="${escapeXml(fill)}" stroke="${escapeXml(element.role === "primary" ? design.colors.primary : design.colors.line)}" stroke-width="2"/><text x="${element.x + element.width / 2}" y="${element.y + element.height / 2 - (lines.length - 1) * 13}" text-anchor="middle" dominant-baseline="middle" fill="${text}" class="node-label">${lines.map((line, index) => `<tspan x="${element.x + element.width / 2}" dy="${index ? 26 : 0}">${escapeXml(line)}</tspan>`).join("")}</text></g>`;
    }
    const fill = element.role === "accent" ? design.colors.accent : design.colors.primary; const opacity = element.shape === "circle" && scene.type === "venn" ? 0.62 : 0.9;
    if (element.shape === "circle") return `<g data-kind="shape" data-id="${escapeXml(element.id)}"><ellipse cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" rx="${element.width / 2}" ry="${element.height / 2}" fill="${escapeXml(fill)}" opacity="${opacity}"/>${element.label ? `<text x="${element.x + element.width / 2}" y="${element.y + element.height / 2 - 20}" text-anchor="middle" class="shape-label">${escapeXml(element.label)}</text>` : ""}</g>`;
    return `<g data-kind="shape" data-id="${escapeXml(element.id)}"><rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="${element.shape === "area" ? 12 : 8}" fill="${escapeXml(fill)}" opacity="${opacity}"/>${element.label ? `<text x="${element.x + element.width / 2}" y="${Math.min(scene.height - 48, element.y + element.height + 30)}" text-anchor="middle" class="shape-label">${escapeXml(element.label)}</text>` : ""}</g>`;
  }).join("");
  const unused = byId.size; void unused;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}" role="img" aria-labelledby="title description"><title id="title">${escapeXml(scene.title)}</title><desc id="description">${escapeXml(scene.type)} diagram with ${scene.elements.length} semantic elements.</desc><defs><marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0 0 L12 6 L0 12 Z" fill="${escapeXml(design.colors.line)}"/></marker><style>${embeddedFontCss}text{font-family:${escapeXml(design.typography.sans)},sans-serif;fill:${escapeXml(design.colors.text)}}.title{font-size:${design.typography.basePx * 2.2}px;font-weight:700}.subtitle{font-size:${design.typography.basePx}px;fill:${escapeXml(design.colors.muted)}}.node-label{font-size:${design.typography.basePx}px;font-weight:600}.edge-label,.shape-label{font-size:${design.typography.basePx * 0.8}px;fill:${escapeXml(design.colors.muted)}}</style></defs><rect width="100%" height="100%" fill="${escapeXml(design.canvas.background)}"/><text x="80" y="78" class="title">${escapeXml(scene.title)}</text><text x="80" y="116" class="subtitle">${escapeXml(scene.type)}</text>${content}</svg>`;
}

function sceneToDrawio(scene: SceneModel, design: Design) {
  let numericId = 2; const ids = new Map<string, number>();
  const cells = scene.elements.filter((entry) => entry.kind !== "edge").map((element) => { const id = numericId++; ids.set(element.id, id); const ellipse = element.kind === "shape" && element.shape === "circle" ? "ellipse;" : "rounded=1;"; const fill = element.role === "accent" ? design.colors.accent : design.colors.surface; return `<mxCell id="${id}" value="${escapeXml(element.label ?? element.id)}" style="${ellipse}whiteSpace=wrap;html=0;fillColor=${escapeXml(fill)};strokeColor=${escapeXml(design.colors.line)};fontColor=${escapeXml(design.colors.text)};" vertex="1" parent="1"><mxGeometry x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" as="geometry"/></mxCell>`; });
  const edges = scene.elements.filter((entry): entry is SceneEdge => entry.kind === "edge").map((edge) => `<mxCell id="${numericId++}" value="${escapeXml(edge.label ?? "")}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=0;endArrow=block;" edge="1" parent="1" source="${ids.get(edge.from) ?? ""}" target="${ids.get(edge.to) ?? ""}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="diagram-production" version="1"><diagram id="page-1" name="Page-1"><mxGraphModel dx="${scene.width}" dy="${scene.height}" grid="1" gridSize="${design.spacing.gridPx}" page="1" pageWidth="${scene.width}" pageHeight="${scene.height}"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join("")}${edges.join("")}</root></mxGraphModel></diagram></mxfile>`;
}

export async function renderDiagram(sourceValue: unknown, designValue: unknown, options: { embeddedFontCss?: string; elk?: ElkEngine } = {}): Promise<RenderResult> {
  const source = rec(sourceValue); const design = designValue as Design; const scene = await buildScene(source, design, options.elk);
  const svg = sceneToSvg(scene, design, options.embeddedFontCss ?? "");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeXml(scene.title)}</title><style>html,body{margin:0;background:${escapeXml(design.canvas.background)}}svg{display:block;width:100%;height:auto}</style></head><body>${svg}</body></html>`;
  return { scene, svg, html, drawio: sceneToDrawio(scene, design) };
}
