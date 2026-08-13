import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ResearchService } from "../server/lib/research-service.mjs";
import { parseTrailer } from "../scripts/lib/seal-validator.mjs";
import { defaultWorkflow, ensureRunSkeleton, readWorkflowFile, workflowPath, writeWorkflow } from "../scripts/lib/workflow-fs.mjs";

async function setup(sessionId = "matrix") {
  const root = await mkdtemp(join(tmpdir(), "research-matrix-"));
  const workspace = join(root, "workspace");
  const dataRoot = join(root, "data");
  await mkdir(workspace);
  await writeFile(join(workspace, "one.md"), "Shared statement.\nSupport.\n", "utf8");
  await writeFile(join(workspace, "two.md"), "Shared statement.\nOppose.\n", "utf8");
  await writeFile(join(workspace, "data.json"), JSON.stringify({ nested: { value: 42 } }), "utf8");
  const service = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId });
  const begun = await service.call("research_begin", { question: "Q", scope: "S", as_of: "2026-08-08", prompt_epoch: 2 });
  return { root, workspace, dataRoot, service, begun };
}

test("multi-source, inference, contested, and JSON-pointer contracts seal together", async () => {
  const { workspace, service, begun } = await setup();
  const workflow = readWorkflowFile(workflowPath(workspace, begun.run_id));
  workflow.allow_solo_main = true;
  writeWorkflow(workspace, workflow);
  const one = await service.call("source_capture", { kind: "workspace", path: "one.md" });
  const two = await service.call("source_capture", { kind: "workspace", path: "two.md" });
  const json = await service.call("source_capture", { kind: "workspace", path: "data.json" });
  const a1 = await service.call("source_anchor", { source_id: one.source_id, kind: "line_range", start_line: 1, end_line: 1 });
  const a2 = await service.call("source_anchor", { source_id: two.source_id, kind: "line_range", start_line: 1, end_line: 1 });
  const support = await service.call("source_anchor", { source_id: one.source_id, kind: "exact_quote", value: "Support." });
  const oppose = await service.call("source_anchor", { source_id: two.source_id, kind: "exact_quote", value: "Oppose." });
  const pointer = await service.call("source_anchor", { source_id: json.source_id, kind: "json_pointer", value: "/nested/value" });
  const sealed = await service.call("research_seal", {
    run_id: begun.run_id,
    prompt_epoch: 2,
    mutation_revision: 4,
    claims: [
      { id: "C1", status: "multi_anchored", text: "Shared statement.", anchor_ids: [a1.anchor_id, a2.anchor_id] },
      { id: "C2", status: "inferred", text: "The value is meaningful.", anchor_ids: [pointer.anchor_id], basis: "The captured JSON contains 42.", caveat: "Meaning is contextual." },
      { id: "C3", status: "contested", text: "The sources disagree.", anchor_ids: [], supporting_anchor_ids: [support.anchor_id], opposing_anchor_ids: [oppose.anchor_id] },
    ],
  });
  assert.match(sealed.seal, /^sha256:/u);
});

test("fabrication, path escape, duplicate anchors, and unknown fields fail closed", async () => {
  const { root, workspace, service } = await setup("negative");
  await assert.rejects(service.call("source_capture", { kind: "workspace", path: "../outside.md" }), /escapes/u);
  await writeFile(join(root, "outside.md"), "outside root\n", "utf8");
  await symlink(join(root, "outside.md"), join(workspace, "linked.md"));
  await assert.rejects(service.call("source_capture", { kind: "workspace", path: "linked.md" }), /escapes/u);
  await assert.rejects(service.call("source_capture", { kind: "workspace", path: "one.md", url: "https://example.test/ignored" }), /exactly one/u);
  await assert.rejects(service.call("source_capture", { kind: "workspace", path: "one.md", surprise: true }), /unknown field/u);
  const source = await service.call("source_capture", { kind: "workspace", path: "one.md" });
  await assert.rejects(service.call("source_anchor", { source_id: source.source_id, kind: "exact_quote", value: "missing" }), /exact_quote/u);
  await assert.rejects(service.call("source_anchor", { source_id: "S999", kind: "line_range", start_line: 1, end_line: 1 }), /unknown source_id/u);
  assert.equal(parseTrailer("Research-Evidence: research-evidence/v1\nResearch-Run: fake\nResearch-Seal: sha256:not-a-digest"), null);
});

test("URL captures use injected bounded transport and private artifacts are mode 0600", async () => {
  const root = await mkdtemp(join(tmpdir(), "research-matrix-url-"));
  const workspace = join(root, "workspace");
  const dataRoot = join(root, "data");
  await mkdir(workspace);
  const service = new ResearchService({
    workspaceRoot: workspace,
    dataRoot,
    sessionId: "url-2",
    fetchText: async () => ({ finalUrl: "https://example.test/final", contentType: "text/plain", text: "Remote evidence.", bytes: 16 }),
  });
  await service.call("research_begin", { question: "Q", scope: "S", as_of: "2026-08-08", prompt_epoch: 1 });
  const source = await service.call("source_capture", { kind: "web", url: "https://example.test/start" });
  assert.equal(source.final_url, "https://example.test/final");
  const content = join(dataRoot, "research-provenance-guard", "runs", service.run.run_id, "sources", `${source.source_id}.txt`);
  assert.equal((await stat(content)).mode & 0o777, 0o600);
});

test("one service process permits only one unfinished run", async () => {
  const { service } = await setup("unfinished");
  await assert.rejects(service.call("research_begin", { question: "Q2", scope: "S", as_of: "2026-08-08", prompt_epoch: 2 }), /unfinished research run/u);
});

test("a sealed run rejects later evidence mutations and cannot be reused", async () => {
  const { service, begun } = await setup("sealed-freeze");
  const sealed = await service.call("research_seal", {
    run_id: begun.run_id,
    prompt_epoch: 2,
    mutation_revision: 0,
    claims: [{ id: "C1", status: "unverified", text: "Unknown", limitation: "No source was captured." }],
  });
  assert.match(sealed.seal, /^sha256:/u);
  await assert.rejects(service.call("source_capture", { kind: "workspace", path: "one.md" }), /sealed/u);
  await assert.rejects(service.call("research_seal", {
    run_id: begun.run_id,
    prompt_epoch: 2,
    mutation_revision: 0,
    claims: [{ id: "C1", status: "unverified", text: "Unknown", limitation: "No source was captured." }],
  }), /sealed/u);

  const replacement = new ResearchService({
    workspaceRoot: service.workspaceRoot,
    dataRoot: service.dataRoot,
    sessionId: "sealed-reuse",
  });
  await assert.rejects(replacement.call("research_begin", {
    question: "Q2",
    scope: "S2",
    as_of: "2026-08-08",
    prompt_epoch: 3,
    run_id: begun.run_id,
  }), /open and unsealed/u);
});

test("automatic begin does not bind a malformed post-seal workflow", async () => {
  const root = await mkdtemp(join(tmpdir(), "research-matrix-bind-"));
  const workspace = join(root, "workspace");
  const dataRoot = join(root, "data");
  await mkdir(workspace);
  const staleRunId = "r-20260808120000-stale01";
  ensureRunSkeleton(workspace, staleRunId);
  const workflow = defaultWorkflow({ runId: staleRunId, question: "old", scope: "old", asOf: "2026-08-08" });
  workflow.phase = "handed_off";
  workflow.completeness.sealed = false;
  writeWorkflow(workspace, workflow);

  const service = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId: "auto-bind" });
  const begun = await service.call("research_begin", { question: "new", scope: "new", as_of: "2026-08-09", prompt_epoch: 1 });
  assert.notEqual(begun.run_id, staleRunId);
});
