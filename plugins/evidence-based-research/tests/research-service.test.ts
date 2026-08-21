import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ResearchService } from "../src/lib/server/research-service.js";
import { validateSealedArtifacts } from "../src/lib/seal-validator.js";
import { readWorkflowFile, workflowPath } from "../src/lib/workflow-fs.js";

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

test("two sessions can research independently in the same workspace", async () => {
  const { workspace, dataRoot } = await fixture();
  const sessionA = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId: "parallel-session-a" });
  const sessionB = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId: "parallel-session-b" });

  const begunA = await sessionA.call("research_begin", { question: "Question A", scope: "scope A", as_of: "2026-08-21", prompt_epoch: 1 });
  await assert.rejects(sessionB.call("research_begin", {
    question: "Question B",
    scope: "scope B",
    as_of: "2026-08-21",
    prompt_epoch: 1,
    run_id: begunA.run_id,
  }), /different session/u);
  const begunB = await sessionB.call("research_begin", { question: "Question B", scope: "scope B", as_of: "2026-08-21", prompt_epoch: 1 });
  assert.notEqual(begunA.run_id, begunB.run_id);

  const capturedA = await sessionA.call("source_capture", { kind: "workspace", path: "source.md" });
  const capturedB = await sessionB.call("source_capture", { kind: "workspace", path: "source.md" });
  assert.equal(capturedA.run_id, begunA.run_id);
  assert.equal(capturedB.run_id, begunB.run_id);
  const readA = await sessionA.call("source_read", { source_id: capturedA.source_id });
  const anchoredA = await sessionA.call("source_anchor", { source_id: capturedA.source_id, kind: "exact_quote", value: "Alpha is documented." });
  const statusA = await sessionA.call("research_status", {});
  assert.equal(readA.run_id, begunA.run_id);
  assert.equal(anchoredA.run_id, begunA.run_id);
  assert.equal(statusA.run_id, begunA.run_id);

  const workflowA = readWorkflowFile(workflowPath(workspace, begunA.run_id));
  const workflowB = readWorkflowFile(workflowPath(workspace, begunB.run_id));
  assert.match(workflowA?.mcp_session_sha256 ?? "", /^[a-f0-9]{64}$/u);
  assert.match(workflowB?.mcp_session_sha256 ?? "", /^[a-f0-9]{64}$/u);
  assert.notEqual(workflowA?.mcp_session_sha256, workflowB?.mcp_session_sha256);
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

test("Firecrawl discovery drains noisy stderr without deadlocking", async () => {
  const { root, workspace, dataRoot } = await fixture();
  const bin = join(root, "bin");
  const executable = join(bin, "firecrawl");
  await mkdir(bin);
  await writeFile(executable, `#!/usr/bin/env node\nprocess.stderr.write("x".repeat(1024 * 1024));\nprocess.stdout.write("[]");\n`, "utf8");
  await chmod(executable, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}:${originalPath}`;
  try {
    const service = new ResearchService({ workspaceRoot: workspace, dataRoot, sessionId: "noisy-discovery" });
    await service.call("research_begin", { question: "Q", scope: "S", as_of: "2026-08-08", prompt_epoch: 1 });
    const discovered = await Promise.race([
      service.call("source_discover", { query: "fixture", limit: 1 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("discovery deadlocked on stderr")), 5_000)),
    ]);
    assert.deepEqual(discovered.results, []);
  } finally {
    process.env.PATH = originalPath;
  }
});

test("missing optional discovery executable degrades without an ENOENT failure", async () => {
  const { workspace, dataRoot } = await fixture();
  const service = new ResearchService({
    workspaceRoot: workspace,
    dataRoot,
    sessionId: "missing-discovery",
    discoveryExecutable: "/definitely/missing/firecrawl",
  });
  const begun = await service.call("research_begin", { question: "Q", scope: "S", as_of: "2026-08-08", prompt_epoch: 1 });
  const discovered = await service.call("source_discover", { query: "fixture", limit: 1 });
  assert.equal(discovered.run_id, begun.run_id);
  assert.equal(discovered.available, false);
  assert.deepEqual(discovered.results, []);
  assert.match(discovered.limitation, /known URL|workspace source/u);
});
