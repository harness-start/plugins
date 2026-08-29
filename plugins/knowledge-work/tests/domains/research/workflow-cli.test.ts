import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ResearchService } from "../../../src/domains/research/lib/server/research-service.js";
import { findActiveWorkflow, readWorkflowFile, workflowPath } from "../../../src/domains/research/lib/workflow-fs.js";

const CLI = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, "research", ...args, "--cwd", cwd], { encoding: "utf8" });
}

test("run-open creates project workflow and blocks outbound until sealed", async () => {
  const root = await mkdtemp(join(tmpdir(), "research-cli-"));
  const open = runCli(["run-open", "--run-id", "r-20260808120000-cli0001"], root);
  assert.equal(open.status, 0, open.stderr);
  const workflow = findActiveWorkflow(root);
  assert.equal(workflow.run_id, "r-20260808120000-cli0001");
  assert.equal(workflow.phase, "open");

  const brief = runCli([
    "brief-write",
    "--run-id", "r-20260808120000-cli0001",
    "--question", "What is documented?",
    "--scope", "fixture",
    "--as-of", "2026-08-08",
  ], root);
  assert.equal(brief.status, 0, brief.stderr);

  const earlyOutbound = runCli([
    "handoff-outbound",
    "--run-id", "r-20260808120000-cli0001",
    "--handoff-file", join(root, "h.md"),
    "--prompt-file", join(root, "p.md"),
  ], root);
  assert.notEqual(earlyOutbound.status, 0);

  await writeFile(join(root, "source.md"), "Alpha is documented.\n", "utf8");
  const dataRoot = join(root, "data");
  await mkdir(dataRoot);
  const service = new ResearchService({ workspaceRoot: root, dataRoot, sessionId: "cli" });
  const begun = await service.call("research_begin", {
    question: "What is documented?",
    scope: "fixture",
    as_of: "2026-08-08",
    prompt_epoch: 1,
    run_id: "r-20260808120000-cli0001",
  });
  const captured = await service.call("source_capture", { kind: "workspace", path: "source.md" });
  const anchor = await service.call("source_anchor", { source_id: captured.source_id, kind: "exact_quote", value: "Alpha is documented." });
  await service.call("research_seal", {
    run_id: begun.run_id,
    prompt_epoch: 1,
    mutation_revision: 0,
    claims: [{ id: "C1", status: "anchored", text: "Alpha is documented.", anchor_ids: [anchor.anchor_id] }],
  });

  await writeFile(join(root, "h.md"), "# handoff\n", "utf8");
  await writeFile(join(root, "p.md"), "Continue from sealed research.\n", "utf8");
  const outbound = runCli([
    "handoff-outbound",
    "--run-id", "r-20260808120000-cli0001",
    "--handoff-file", join(root, "h.md"),
    "--prompt-file", join(root, "p.md"),
  ], root);
  assert.equal(outbound.status, 0, outbound.stderr);
  const after = readWorkflowFile(workflowPath(root, "r-20260808120000-cli0001"));
  assert.equal(after.phase, "handed_off");
  assert.equal(after.completeness.outbound_handoff, true);
  assert.match(await readFile(join(root, ".research/runs/r-20260808120000-cli0001/handoffs/outbound/prompt.md"), "utf8"), /Continue from sealed/u);
  assert.equal(after.outbound_handoff.prompt_sha256_prefix, createHash("sha256").update("Continue from sealed research.\n").digest("hex").slice(0, 16));

  const manualComplete = runCli(["run-complete", "--run-id", begun.run_id], root);
  assert.notEqual(manualComplete.status, 0, "only a successful Stop hook may complete a run");
});

test("workflow CLI cannot self-authorize abort or expose removed inbound lifecycle commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "research-cli-guard-"));
  const runId = "r-20260808120000-cli0002";
  assert.equal(runCli(["run-open", "--run-id", runId], root).status, 0);

  const manualAbort = runCli(["run-abort", "--run-id", runId], root);
  assert.notEqual(manualAbort.status, 0, "only the exact user abort prompt may abort a run");
  assert.equal(findActiveWorkflow(root)?.run_id, runId);

  assert.notEqual(runCli(["handoff-inbound", "--run-id", runId], root).status, 0);
  assert.notEqual(runCli(["handoff-result", "--run-id", runId], root).status, 0);
});
