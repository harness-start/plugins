import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ResearchService } from "../../../src/domains/research/lib/server/research-service.js";
import { validateSealedArtifacts } from "../../../src/domains/research/lib/seal-validator.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "research-guard-"));
  const workspace = join(root, "workspace");
  const dataRoot = join(root, "data");
  await mkdir(workspace, { recursive: true });
  await writeFile(join(workspace, "source.md"), "Alpha is documented.\nBeta is disputed.\n", "utf8");
  return { root, workspace, dataRoot };
}

test("public MCP service creates anchored evidence and a verifiable seal", async () => {
  const { workspace, dataRoot } = await fixture();
  const service = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId: "session-1" });
  const begun = await service.call("research_begin", {
    question: "What is documented?",
    scope: "fixture only",
    as_of: "2026-08-08",
    prompt_epoch: 3,
  });
  const captured = await service.call("source_capture", { kind: "workspace", path: "source.md" });
  const anchor = await service.call("source_anchor", {
    source_id: captured.source_id,
    kind: "exact_quote",
    value: "Alpha is documented.",
  });
  const sealed = await service.call("research_seal", {
    run_id: begun.run_id,
    prompt_epoch: 3,
    mutation_revision: 0,
    claims: [{ id: "C1", status: "anchored", text: "Alpha is documented.", anchor_ids: [anchor.anchor_id] }],
  });

  assert.match(sealed.seal, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(sealed.trailer, `Research-Evidence: research-evidence/v1\nResearch-Run: ${begun.run_id}\nResearch-Seal: ${sealed.seal}`);
  const manifest = JSON.parse(await readFile(join(workspace, sealed.manifest_path), "utf8"));
  assert.equal(manifest.schema, "research-manifest/v1");
  assert.equal(manifest.claims[0].status, "anchored");
  assert.deepEqual(await validateSealedArtifacts({ workspaceRoot: workspace, runId: begun.run_id, seal: sealed.seal }), []);
});

test("multi-source seal depends on captured evidence, not subagent lifecycle state", async () => {
  const { workspace, dataRoot } = await fixture();
  await writeFile(join(workspace, "other.md"), "Gamma is extra.\n", "utf8");
  const service = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId: "session-multi" });
  const begun = await service.call("research_begin", {
    question: "What is documented?",
    scope: "fixture only",
    as_of: "2026-08-08",
    prompt_epoch: 1,
  });
  const first = await service.call("source_capture", { kind: "workspace", path: "source.md" });
  await service.call("source_capture", { kind: "workspace", path: "other.md" });
  const anchor = await service.call("source_anchor", {
    source_id: first.source_id,
    kind: "exact_quote",
    value: "Alpha is documented.",
  });
  const sealed = await service.call("research_seal", {
    run_id: begun.run_id,
    prompt_epoch: 1,
    mutation_revision: 0,
    claims: [{ id: "C1", status: "anchored", text: "Alpha is documented.", anchor_ids: [anchor.anchor_id] }],
  });
  assert.match(sealed.seal, /^sha256:[a-f0-9]{64}$/u);
});

test("claim status contracts fail closed", async () => {
  const { workspace, dataRoot } = await fixture();
  const service = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId: "session-2" });
  const { run_id } = await service.call("research_begin", { question: "Q", scope: "S", as_of: "2026-08-08", prompt_epoch: 1 });
  await assert.rejects(
    service.call("research_seal", {
      run_id,
      prompt_epoch: 1,
      mutation_revision: 0,
      claims: [{ id: "C1", status: "anchored", text: "unsupported", anchor_ids: [] }],
    }),
    /anchored claim requires at least one anchor/u,
  );
  await assert.rejects(
    service.call("research_seal", {
      run_id,
      prompt_epoch: 1,
      mutation_revision: 0,
      claims: [{ id: "C1", status: "unverified", text: "unknown" }],
    }),
    /unverified claim requires limitation/u,
  );
});

test("post-seal artifact mutation invalidates the digest", async () => {
  const { workspace, dataRoot } = await fixture();
  const service = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId: "session-3" });
  const begun = await service.call("research_begin", { question: "Q", scope: "S", as_of: "2026-08-08", prompt_epoch: 1 });
  const sealed = await service.call("research_seal", {
    run_id: begun.run_id,
    prompt_epoch: 1,
    mutation_revision: 0,
    claims: [{ id: "C1", status: "unverified", text: "Unknown", limitation: "No source was available." }],
  });
  await writeFile(join(workspace, sealed.report_path), "tampered\n", "utf8");
  const findings = await validateSealedArtifacts({ workspaceRoot: workspace, runId: begun.run_id, seal: sealed.seal });
  assert.ok(findings.some((finding) => finding.includes("report hash mismatch")));
});

test("provider-specific discovery is absent from the public service", async () => {
  const { workspace, dataRoot } = await fixture();
  const service = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId: "host-discovery" });
  await service.call("research_begin", { question: "Q", scope: "S", as_of: "2026-08-08", prompt_epoch: 1 });
  await assert.rejects(
    service.call("source_discover", { query: "fixture", limit: 1 }),
    /unknown tool: source_discover/u,
  );
});
