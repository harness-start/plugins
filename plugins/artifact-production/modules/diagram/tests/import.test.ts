import assert from "node:assert/strict";
import test from "node:test";

import { deflateSync, strToU8, zlibSync } from "fflate";

import { importDiagramSource } from "../src/lib/import.js";

test("imports the bounded Mermaid flowchart grammar with a fidelity ledger", () => {
  const result = importDiagramSource("request-flow.mmd", Buffer.from("flowchart LR\n  client[Client] -->|request| api[API]\n"));
  assert.equal(result.source.type, "flowchart");
  assert.deepEqual(result.source.nodes, [{ id: "client", label: "Client" }, { id: "api", label: "API" }]);
  assert.equal(result.ledger.sourceFormat, "mermaid");
  assert.equal(result.ledger.losses.length, 0);
});

test("fails closed for unsupported Mermaid grammar", () => {
  assert.throws(() => importDiagramSource("unsupported.mmd", Buffer.from("sankey-beta\nA,B,2\n")), /MERMAID_GRAMMAR_UNSUPPORTED/u);
});

test("imports bounded draw.io XML without following links", () => {
  const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Client" vertex="1" parent="1"><mxGeometry x="20" y="20" width="120" height="60" as="geometry"/></mxCell><mxCell id="b" value="API" vertex="1" parent="1"><mxGeometry x="240" y="20" width="120" height="60" as="geometry"/></mxCell><mxCell id="e" value="request" edge="1" source="a" target="b" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel>`;
  const result = importDiagramSource("request.drawio", Buffer.from(xml));
  assert.equal(result.source.type, "flowchart");
  assert.equal(result.source.nodes.length, 2);
  assert.equal(result.source.edges.length, 1);
  assert.equal(result.ledger.sourceFormat, "drawio");
});

test("imports every declared bounded Mermaid grammar", () => {
  const cases = [
    ["sequenceDiagram\nparticipant A as Client\nparticipant B as API\nA->>B: request", "sequence"],
    ["stateDiagram-v2\n[*] --> Idle\nIdle --> Done: finish", "state-machine"],
    ["erDiagram\nCUSTOMER ||--o{ ORDER : places", "er"],
    ["gantt\ntitle Plan\nTask A :a, 2026-01-01, 1d", "gantt"],
    ["timeline\n2026 : Launch", "timeline"],
    ["mindmap\nroot((Plan))\n  Build", "tree"],
    ["quadrantChart\nCandidate A: [0.2, 0.8]", "quadrant"],
    ["journey\nsection Use\nOpen app: 5: User", "process"],
    ["xychart-beta\nline [1, 2, 3]", "line"],
  ] as const;
  for (const [mermaid, expected] of cases) assert.equal(importDiagramSource(`${expected}.mmd`, Buffer.from(mermaid)).source.type, expected);
});

test("imports a compressed draw.io diagram page", () => {
  const graph = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="A" vertex="1" parent="1"/><mxCell id="b" value="B" vertex="1" parent="1"/><mxCell id="e" edge="1" source="a" target="b" parent="1"/></root></mxGraphModel>`;
  const encoded = Buffer.from(deflateSync(strToU8(encodeURIComponent(graph)))).toString("base64");
  const result = importDiagramSource("compressed.drawio", Buffer.from(`<mxfile><diagram>${encoded}</diagram></mxfile>`));
  assert.equal(result.source.nodes.length, 2);
  assert.equal(result.source.edges.length, 1);
});

test("imports draw.io XML from a compressed PNG metadata chunk", () => {
  const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="A" vertex="1" parent="1"/></root></mxGraphModel>`;
  const data = Buffer.concat([Buffer.from("mxfile\0\0", "latin1"), Buffer.from(zlibSync(strToU8(xml)))]);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), length, Buffer.from("zTXt"), data, Buffer.alloc(4), Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0])]);
  const result = importDiagramSource("embedded.drawio.png", png);
  assert.equal(result.source.nodes[0]?.label, "A");
});
