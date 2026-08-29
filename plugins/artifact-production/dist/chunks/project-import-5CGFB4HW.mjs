#!/usr/bin/env node
// harness-source-hash: sha256:ccd7fb231793f87ef34f4d17127378fdb4cc6bb7c7de2d6c776759c0dd767bba
import {
  inflateSync,
  strFromU8,
  unzlibSync
} from "./chunk-PUJQMLWW.mjs";
import {
  require_lib
} from "./chunk-7REKS3VS.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "./chunk-WL6ZFAUJ.mjs";
import "./chunk-VBL6ZSQA.mjs";
import {
  IMPORT_LEDGER_SCHEMA,
  SOURCE_SCHEMA,
  assertDiagramProjectRoot,
  atomicWriteJson,
  computeDiagramSubjectDigest,
  loadDiagramProject,
  validateDiagramModel,
  withWriterJournal
} from "./chunk-XDPUXKOH.mjs";
import {
  __toESM
} from "./chunk-NNXJRIQT.mjs";

// plugins/artifact-production/src/domains/diagram/entries/cli/project-import.ts
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

// plugins/artifact-production/src/domains/diagram/lib/import.ts
var import_xmldom = __toESM(require_lib(), 1);
var MAX_SOURCE_BYTES = 8 * 1024 * 1024;
var MAX_INFLATED_BYTES = 16 * 1024 * 1024;
var SUPPORTED_MERMAID = /^(?:flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|timeline|mindmap|quadrantChart|journey|xychart-beta)\b/iu;
var decodeEntities = (value) => value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&");
var cleanLabel = (value) => decodeEntities(value.replace(/^[[({]+|[\])}]+$/gu, "").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim());
var stableId = (value, index) => value.trim().replace(/[^a-zA-Z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "").toLowerCase() || `item-${index + 1}`;
function boundedText(bytes) {
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error("IMPORT_SIZE_EXCEEDED");
  const text = bytes.toString("utf8");
  if (text.includes("\uFFFD")) throw new Error("IMPORT_UTF8_INVALID");
  return text.replace(/^\uFEFF/u, "");
}
function base(sourceFormat, sourceName) {
  return { schema: IMPORT_LEDGER_SCHEMA, sourceFormat, sourceName, preserved: [], approximations: [], losses: [] };
}
function upsertNode(nodes, id, label = id) {
  if (!nodes.some((node) => node.id === id)) nodes.push({ id, label: cleanLabel(label) || id });
}
function mermaidFlow(text, sourceName) {
  const lines = text.split(/\r?\n/u).slice(1);
  const nodes = [];
  const edges = [];
  const nodeToken = String.raw`([A-Za-z_][\w-]*)(?:\s*(\[[^\]]*\]|\([^)]*\)|\{[^}]*\}))?`;
  const edge = new RegExp(`${nodeToken}\\s*(?:-->|---|-.->|==>)\\s*(?:\\|([^|]*)\\|\\s*)?${nodeToken}`, "u");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("%%") || /^(?:subgraph|end|direction)\b/iu.test(line)) continue;
    const match = line.match(edge);
    if (match) {
      const from = match[1] ?? "";
      const to = match[4] ?? "";
      upsertNode(nodes, from, match[2] ?? from);
      upsertNode(nodes, to, match[5] ?? to);
      edges.push({ from, to, ...match[3]?.trim() ? { label: cleanLabel(match[3]) } : {} });
      continue;
    }
    const single = line.match(new RegExp(`^${nodeToken}$`, "u"));
    if (single?.[1]) upsertNode(nodes, single[1], single[2] ?? single[1]);
  }
  if (!nodes.length) throw new Error("MERMAID_CONTENT_EMPTY");
  const ledger = base("mermaid", sourceName);
  ledger.preserved.push("node-labels", "directed-connections");
  return { source: { schema: SOURCE_SCHEMA, type: "flowchart", title: sourceName.replace(/\.[^.]+$/u, ""), nodes, edges }, ledger };
}
function mermaidSequence(text, sourceName) {
  const nodes = [];
  const edges = [];
  for (const raw of text.split(/\r?\n/u).slice(1)) {
    const line = raw.trim();
    const participant = line.match(/^(?:participant|actor)\s+([\w-]+)(?:\s+as\s+(.+))?$/iu);
    if (participant?.[1]) {
      upsertNode(nodes, participant[1], participant[2] ?? participant[1]);
      continue;
    }
    const message = line.match(/^([\w-]+)\s*(?:--?>>?|->>|--x|-x)\s*([\w-]+)\s*:\s*(.+)$/u);
    if (message?.[1] && message[2]) {
      upsertNode(nodes, message[1]);
      upsertNode(nodes, message[2]);
      edges.push({ from: message[1], to: message[2], label: cleanLabel(message[3] ?? "") });
    }
  }
  if (!nodes.length) throw new Error("MERMAID_CONTENT_EMPTY");
  const ledger = base("mermaid", sourceName);
  ledger.preserved.push("participants", "message-order", "message-labels");
  ledger.approximations.push("activation-and-note-styling");
  return { source: { schema: SOURCE_SCHEMA, type: "sequence", title: sourceName.replace(/\.[^.]+$/u, ""), nodes, edges }, ledger };
}
function mermaidStateOrEr(text, sourceName, type) {
  const nodes = [];
  const edges = [];
  for (const raw of text.split(/\r?\n/u).slice(1)) {
    const line = raw.trim();
    if (!line || line.startsWith("%%") || line === "}") continue;
    const relation = type === "state-machine" ? line.match(/^(\[\*\]|[\w-]+)\s*-->\s*(\[\*\]|[\w-]+)(?:\s*:\s*(.+))?$/u) : line.match(/^([\w-]+)\s+[^\s]+\s+([\w-]+)\s*:\s*(.+)$/u);
    if (relation?.[1] && relation[2]) {
      const from = relation[1] === "[*]" ? "start" : relation[1];
      const to = relation[2] === "[*]" ? "end" : relation[2];
      upsertNode(nodes, from);
      upsertNode(nodes, to);
      edges.push({ from, to, ...relation[3] ? { label: cleanLabel(relation[3]) } : {} });
      continue;
    }
    const entity = line.match(/^([\w-]+)\s*\{/u);
    if (entity?.[1]) upsertNode(nodes, entity[1]);
  }
  if (!nodes.length) throw new Error("MERMAID_CONTENT_EMPTY");
  const ledger = base("mermaid", sourceName);
  ledger.preserved.push("entities-or-states", "relationships");
  ledger.approximations.push("source-specific-cardinality-and-style");
  return { source: { schema: SOURCE_SCHEMA, type, title: sourceName.replace(/\.[^.]+$/u, ""), nodes, edges }, ledger };
}
function mermaidList(text, sourceName, type) {
  const items = [];
  const nodes = [];
  const edges = [];
  for (const raw of text.split(/\r?\n/u).slice(1)) {
    const line = raw.trim();
    if (!line || /^(?:title|dateFormat|axisFormat|section|x-axis|y-axis)\b/iu.test(line)) continue;
    const label = cleanLabel(line.replace(/^[-+*]\s*/u, "").split(":")[0] ?? line);
    const id = stableId(label, nodes.length);
    if (!label) continue;
    items.push({ id, label, raw: line });
    upsertNode(nodes, id, label);
    if (nodes.length > 1 && type === "tree") edges.push({ from: nodes[0]?.id ?? id, to: id });
  }
  if (!items.length) throw new Error("MERMAID_CONTENT_EMPTY");
  const ledger = base("mermaid", sourceName);
  ledger.preserved.push("ordered-content", "labels");
  ledger.approximations.push("grammar-specific-decoration");
  return { source: { schema: SOURCE_SCHEMA, type, title: sourceName.replace(/\.[^.]+$/u, ""), nodes, edges, items, data: items }, ledger };
}
function importMermaid(text, sourceName) {
  const normalized = text.trim();
  const header = normalized.split(/\r?\n/u)[0]?.trim() ?? "";
  if (!SUPPORTED_MERMAID.test(header)) throw new Error("MERMAID_GRAMMAR_UNSUPPORTED");
  if (/^(?:flowchart|graph)\b/iu.test(header)) return mermaidFlow(normalized, sourceName);
  if (/^sequenceDiagram\b/iu.test(header)) return mermaidSequence(normalized, sourceName);
  if (/^stateDiagram/iu.test(header)) return mermaidStateOrEr(normalized, sourceName, "state-machine");
  if (/^erDiagram/iu.test(header)) return mermaidStateOrEr(normalized, sourceName, "er");
  if (/^gantt\b/iu.test(header)) return mermaidList(normalized, sourceName, "gantt");
  if (/^timeline\b/iu.test(header)) return mermaidList(normalized, sourceName, "timeline");
  if (/^mindmap\b/iu.test(header)) return mermaidList(normalized, sourceName, "tree");
  if (/^quadrantChart\b/iu.test(header)) return mermaidList(normalized, sourceName, "quadrant");
  if (/^journey\b/iu.test(header)) return mermaidList(normalized, sourceName, "process");
  return mermaidList(normalized, sourceName, "line");
}
function validateXmlBounds(xml) {
  if (Buffer.byteLength(xml) > MAX_INFLATED_BYTES) throw new Error("IMPORT_INFLATED_SIZE_EXCEEDED");
  if (/<!DOCTYPE|<!ENTITY|<script\b/iu.test(xml)) throw new Error("DRAWIO_XML_UNSAFE");
  let depth = 0;
  let maximum = 0;
  for (const match of xml.matchAll(/<\/?([A-Za-z][\w:.-]*)\b[^>]*>/gu)) {
    if (match[0].startsWith("</")) depth -= 1;
    else if (!match[0].endsWith("/>")) {
      depth += 1;
      maximum = Math.max(maximum, depth);
    }
    if (depth < 0 || maximum > 128) throw new Error("DRAWIO_XML_DEPTH_EXCEEDED");
  }
}
function decodeCompressedDiagram(value) {
  const binary = Buffer.from(value.trim(), "base64");
  const inflated = inflateSync(binary, { out: new Uint8Array(MAX_INFLATED_BYTES) });
  return decodeURIComponent(strFromU8(inflated));
}
function embeddedDrawio(name, bytes, text) {
  if (name.endsWith(".svg")) {
    const attribute = text.match(/\bcontent=["']([^"']*(?:%3Cmxfile|&lt;mxfile)[^"']*)["']/iu)?.[1];
    if (attribute) return decodeURIComponent(decodeEntities(attribute));
    const raw = text.match(/<mxfile\b[\s\S]*<\/mxfile>/iu)?.[0];
    if (raw) return raw;
  }
  if (name.endsWith(".png")) {
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("DRAWIO_PNG_SIGNATURE_INVALID");
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
      const start = offset + 8;
      const end = start + length;
      if (length > MAX_SOURCE_BYTES || end + 4 > bytes.length) throw new Error("DRAWIO_PNG_CHUNK_INVALID");
      const chunk = bytes.subarray(start, end);
      const separator = chunk.indexOf(0);
      const keyword = separator >= 0 ? chunk.subarray(0, separator).toString("latin1") : "";
      if (keyword === "mxfile") {
        let value;
        if (type === "tEXt") value = chunk.subarray(separator + 1).toString("utf8");
        else if (type === "zTXt") {
          if (chunk[separator + 1] !== 0) throw new Error("DRAWIO_PNG_COMPRESSION_UNSUPPORTED");
          value = strFromU8(unzlibSync(chunk.subarray(separator + 2)));
        } else if (type === "iTXt") {
          const compressed = chunk[separator + 1] === 1;
          let cursor = separator + 3;
          for (let skipped = 0; skipped < 2; skipped += 1) {
            const next = chunk.indexOf(0, cursor);
            if (next < 0) throw new Error("DRAWIO_PNG_ITXT_INVALID");
            cursor = next + 1;
          }
          value = compressed ? strFromU8(unzlibSync(chunk.subarray(cursor))) : chunk.subarray(cursor).toString("utf8");
        } else {
          offset = end + 4;
          continue;
        }
        return /^%3C/iu.test(value.trim()) ? decodeURIComponent(value.trim()) : decodeEntities(value.trim());
      }
      offset = end + 4;
    }
    throw new Error("DRAWIO_PNG_METADATA_MISSING");
  }
  return text;
}
function importDrawio(name, bytes, initialText) {
  let xml = embeddedDrawio(name, bytes, initialText);
  validateXmlBounds(xml);
  const parser = new import_xmldom.DOMParser({ errorHandler: () => void 0 });
  let document = parser.parseFromString(xml, "application/xml");
  if (document.documentElement?.tagName === "mxfile") {
    const diagram = document.getElementsByTagName("diagram")[0];
    if (!diagram) throw new Error("DRAWIO_DIAGRAM_MISSING");
    const childXml = Array.from(diagram.childNodes).map((node) => node.toString()).join("").trim();
    xml = childXml.includes("<mxGraphModel") ? childXml : decodeCompressedDiagram(diagram.textContent ?? "");
    validateXmlBounds(xml);
    document = parser.parseFromString(xml, "application/xml");
  }
  if (document.documentElement?.tagName !== "mxGraphModel") throw new Error("DRAWIO_GRAPH_MODEL_MISSING");
  const nodes = [];
  const edges = [];
  for (const cell of Array.from(document.getElementsByTagName("mxCell"))) {
    const id = cell.getAttribute("id") ?? "";
    const value = cleanLabel(cell.getAttribute("value") ?? id);
    if (cell.getAttribute("vertex") === "1" && id) nodes.push({ id, label: value || id });
    if (cell.getAttribute("edge") === "1") {
      const from = cell.getAttribute("source") ?? "";
      const to = cell.getAttribute("target") ?? "";
      if (from && to) edges.push({ from, to, ...value ? { label: value } : {} });
    }
  }
  if (!nodes.length) throw new Error("DRAWIO_CONTENT_EMPTY");
  const known = new Set(nodes.map(({ id }) => id));
  const boundedEdges = edges.filter(({ from, to }) => known.has(from) && known.has(to));
  const ledger = base("drawio", name);
  ledger.preserved.push("node-labels", "connectivity");
  ledger.approximations.push("geometry-normalized-to-deterministic-layout", "styles-mapped-to-semantic-tokens");
  ledger.losses.push("unsupported-custom-shapes", "external-links-not-followed");
  return { source: { schema: SOURCE_SCHEMA, type: "flowchart", title: name.replace(/\.(?:drawio(?:\.xml)?|svg|png)$/iu, ""), nodes, edges: boundedEdges }, ledger };
}
function importDiagramSource(sourceName, bytes) {
  const name = sourceName.toLowerCase();
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error("IMPORT_SIZE_EXCEEDED");
  const text = name.endsWith(".drawio.png") ? "" : boundedText(bytes);
  if (/\.(?:mmd|mermaid)$/u.test(name)) return importMermaid(text, sourceName);
  if (/\.drawio(?:\.xml|\.svg|\.png)?$/u.test(name)) return importDrawio(name, bytes, text);
  throw new Error("IMPORT_FORMAT_UNSUPPORTED");
}

// plugins/artifact-production/src/domains/diagram/entries/cli/project-import.ts
async function main() {
  const root = assertDiagramProjectRoot(process.argv[2]);
  const rawInputPath = process.argv[3] ?? "";
  if (!isAbsolute(rawInputPath)) throw new Error("IMPORT_PATH_INVALID");
  const inputPath = resolve(rawInputPath);
  let model = await loadDiagramProject(root);
  const grant = await consumeWriterCapability({ root, capability: "diagram-import", argv: processWriterArgv() });
  if (grant.subjectDigest !== computeDiagramSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const findings = validateDiagramModel(model, { stage: "source" });
  if (findings.length) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const result = importDiagramSource(relative(root, inputPath), await readFile(inputPath));
  await withWriterJournal(root, "diagram-import", async () => {
    await atomicWriteJson(root, "src/diagram.json", result.source);
    await atomicWriteJson(root, "plan.import-ledger.json", result.ledger);
  }, grant);
  model = await loadDiagramProject(root);
  process.stdout.write(`${JSON.stringify({ type: result.source.type, subjectDigest: computeDiagramSubjectDigest(model), losses: result.ledger.losses })}
`);
}
await main().catch((error) => {
  process.stderr.write(`[diagram-project-import] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
