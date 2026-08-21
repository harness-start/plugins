import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { main as researchWorkflowMain } from "../../../src/entries/cli/research-workflow.js";
import { readWorkflowFile, workflowPath } from "../../../src/lib/workflow-fs.js";

const CLI = fileURLToPath(new URL("../../../dist/cli/research-workflow.mjs", import.meta.url));

function runCli(args: string[], cwd: string, sessionId: string) {
  return spawnSync(process.execPath, [CLI, ...args, "--cwd", cwd], {
    encoding: "utf8",
    env: { ...process.env, AI_EXPERTS_SESSION_ID: sessionId },
  });
}

test("parallel CLI sessions open isolated workflows and reject foreign mutations", async () => {
  assert.equal(typeof researchWorkflowMain, "function");
  const workspace = await mkdtemp(join(tmpdir(), "research-cli-parallel-"));
  const runA = "r-20260821140000-clia";
  const runB = "r-20260821140001-clib";

  const openA = runCli(["run-open", "--run-id", runA], workspace, "cli-session-a");
  const openB = runCli(["run-open", "--run-id", runB], workspace, "cli-session-b");
  assert.equal(openA.status, 0, openA.stderr);
  assert.equal(openB.status, 0, openB.stderr);

  const workflowA = readWorkflowFile(workflowPath(workspace, runA));
  const workflowB = readWorkflowFile(workflowPath(workspace, runB));
  assert.match(workflowA?.owner_session_sha256 ?? "", /^[a-f0-9]{64}$/u);
  assert.match(workflowB?.owner_session_sha256 ?? "", /^[a-f0-9]{64}$/u);
  assert.notEqual(workflowA?.owner_session_sha256, workflowB?.owner_session_sha256);

  const foreignBrief = runCli([
    "brief-write",
    "--run-id", runB,
    "--question", "Foreign mutation",
    "--scope", "must fail",
    "--as-of", "2026-08-21",
  ], workspace, "cli-session-a");
  assert.notEqual(foreignBrief.status, 0);
  assert.match(foreignBrief.stderr, /different session/u);
  assert.equal(resolve(workspace), workspace);
});
