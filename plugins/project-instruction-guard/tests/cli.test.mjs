import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../scripts/project-instructions-cli.mjs", import.meta.url));

function repository() {
  const root = mkdtempSync(join(tmpdir(), "project-instruction-cli-"));
  execFileSync("git", ["init", "-q", root]);
  return root;
}

function invoke(args, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, AI_EXPERTS_SESSION_ID: "session-1", AI_EXPERTS_TRIGGER_FROM: "test", ...env },
  });
}

test("CLI emits linked inspect, reconcile, and verify receipts", (context) => {
  const root = repository();
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const inspected = invoke(["inspect", "--workspace", root]);
  assert.equal(inspected.status, 0);
  const inspectReceipt = JSON.parse(inspected.stdout);
  assert.equal(inspectReceipt.toolId, "project-instructions-inspect");
  assert.equal(inspectReceipt.provenance.sessionPresent, true);
  assert.match(inspectReceipt.provenance.sessionDigest, /^[a-f0-9]{64}$/u);

  const reconciled = invoke([
    "reconcile", "--workspace", root,
    "--expected-state-digest", inspectReceipt.result.stateDigest,
  ]);
  assert.equal(reconciled.status, 0);
  const reconcileReceipt = JSON.parse(reconciled.stdout);
  assert.equal(reconcileReceipt.result.changed, true);

  const verified = invoke([
    "verify", "--workspace", root,
    "--decision", "changed",
    "--expected-revision-id", reconcileReceipt.result.revisionId,
    "--verifies-invocation-id", reconcileReceipt.invocationId,
  ]);
  assert.equal(verified.status, 0);
  const verifyReceipt = JSON.parse(verified.stdout);
  assert.equal(verifyReceipt.result.ok, true);
  assert.equal(verifyReceipt.provenance.verifiesInvocationId, reconcileReceipt.invocationId);
  assert.match(verifyReceipt.observationDigest, /^[a-f0-9]{64}$/u);
});

test("CLI fails closed for invalid verification and malformed arguments", (context) => {
  const root = repository();
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const invalid = invoke(["verify", "--workspace", root, "--decision", "no-change"]);
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stderr).ok, false);

  const malformed = invoke(["inspect", "--workspace"]);
  assert.equal(malformed.status, 1);
  assert.match(JSON.parse(malformed.stderr).error, /invalid argument/u);
});
