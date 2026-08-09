import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  bindContractAfterMutation,
  completionFindings,
  observeCommand,
  refreshBinding,
} from "../scripts/lib/workflow.mjs";
import { regressionContract } from "./fixtures.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "behavioral-workflow-"));
  const data = mkdtempSync(join(tmpdir(), "behavioral-data-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, ".behavioral-regression"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "src", "normalize.js"), "export const normalize = value => value;\n");
  for (const name of ["primary", "boundary", "representation", "compat"]) {
    writeFileSync(join(root, "test", `${name}.mjs`), `// ${name}\n`);
  }
  const path = join(root, ".behavioral-regression", "BR-20260809-normalize.json");
  writeFileSync(path, `${JSON.stringify(regressionContract(), null, 2)}\n`);
  return { root, data, path };
}

function withData(data, callback) {
  const prior = process.env.PLUGIN_DATA;
  process.env.PLUGIN_DATA = data;
  try { return callback(); }
  finally {
    if (prior === undefined) delete process.env.PLUGIN_DATA;
    else process.env.PLUGIN_DATA = prior;
  }
}

function bind(fx, sessionId = "session-a") {
  return withData(fx.data, () => bindContractAfterMutation({
    cwd: fx.root,
    sessionId,
    touchedPaths: [fx.path],
  }));
}

test("no contract mutation is an exact no-op and a valid mutation activates", () => {
  const fx = fixture();
  assert.deepEqual(withData(fx.data, () => bindContractAfterMutation({ cwd: fx.root, sessionId: "s", touchedPaths: [] })), { kind: "idle" });
  const active = bind(fx);
  assert.equal(active.kind, "bound");
  assert.equal(active.contract.id, "BR-20260809-normalize");
});

test("BEFORE receipts require unchanged production and literal expected output", () => {
  const fx = fixture();
  bind(fx);
  withData(fx.data, () => {
    const wrongText = observeCommand({
      cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs",
      outcome: "failure", output: "generic assertion failed",
    });
    assert.equal(wrongText.kind, "ignored");

    const receipt = observeCommand({
      cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs",
      outcome: "failure", output: "PRIMARY_REPRO: legacy input rejected",
    });
    assert.equal(receipt.kind, "recorded");
    assert.equal(receipt.receipts[0].phase, "before");

    writeFileSync(join(fx.root, "src", "normalize.js"), "export const normalize = () => 'changed';\n");
    const late = observeCommand({
      cwd: fx.root, sessionId: "session-a", command: "node test/representation.mjs",
      outcome: "failure", output: "REPRESENTATION_REPRO",
    });
    assert.equal(late.kind, "rejected");
    assert.match(late.reason, /before.*production change/ui);
  });
});

test("verification weakening invalidates receipts and stale green cannot close", () => {
  const fx = fixture();
  bind(fx);
  withData(fx.data, () => {
    const baseline = observeCommand({ cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs", outcome: "failure", output: "PRIMARY_REPRO" });
    assert.equal(baseline.kind, "recorded");
    writeFileSync(join(fx.root, "test", "primary.mjs"), "// weakened\n");
    const invalid = refreshBinding({ cwd: fx.root, sessionId: "session-a" });
    assert.equal(invalid.kind, "invalid");
    assert.match(invalid.findings.join("\n"), /verification assets changed/u);
  });

  const stale = fixture();
  bind(stale);
  withData(stale.data, () => {
    for (const [command, outcome, output] of [
      ["node test/primary.mjs", "failure", "PRIMARY_REPRO"],
      ["node test/boundary.mjs", "success", "BOUNDARY_OK"],
      ["node test/representation.mjs", "failure", "REPRESENTATION_REPRO"],
      ["node test/compat.mjs", "success", "COMPAT_OK"],
    ]) observeCommand({ cwd: stale.root, sessionId: "session-a", command, outcome, output });
    writeFileSync(join(stale.root, "src", "normalize.js"), "export const normalize = value => String(value);\n");
    for (const [command, output] of [
      ["node test/primary.mjs", "PRIMARY_FIXED"],
      ["node test/boundary.mjs", "BOUNDARY_OK"],
      ["node test/representation.mjs", "REPRESENTATION_FIXED"],
      ["node test/compat.mjs", "COMPAT_OK"],
    ]) observeCommand({ cwd: stale.root, sessionId: "session-a", command, outcome: "success", output });

    let contract = regressionContract();
    const live = refreshBinding({ cwd: stale.root, sessionId: "session-a" });
    for (const item of contract.cases) {
      const receipts = live.run.receipts.filter((receipt) => receipt.caseId === item.id);
      item.receipts.before = receipts.find((receipt) => receipt.phase === "before")?.id ?? null;
      item.receipts.after = receipts.find((receipt) => receipt.phase === "after")?.id ?? null;
    }
    contract.status = "closed";
    writeFileSync(stale.path, `${JSON.stringify(contract, null, 2)}\n`);
    assert.deepEqual(completionFindings(refreshBinding({ cwd: stale.root, sessionId: "session-a" })), []);

    writeFileSync(join(stale.root, "src", "normalize.js"), "export const normalize = () => 'later edit';\n");
    assert.match(completionFindings(refreshBinding({ cwd: stale.root, sessionId: "session-a" })).join("\n"), /stale AFTER/u);
  });
});

test("plan edits reset BEFORE before production change and are rejected afterward", () => {
  const fx = fixture();
  bind(fx);
  withData(fx.data, () => {
    observeCommand({ cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs", outcome: "failure", output: "PRIMARY_REPRO" });
    const revised = regressionContract();
    revised.problem.actual = "legacy input throws a typed error";
    writeFileSync(fx.path, `${JSON.stringify(revised, null, 2)}\n`);
    const reset = bindContractAfterMutation({ cwd: fx.root, sessionId: "session-a", touchedPaths: [fx.path] });
    assert.equal(reset.kind, "replanned");
    assert.equal(reset.run.receipts.length, 0);

    writeFileSync(join(fx.root, "src", "normalize.js"), "export const normalize = value => String(value);\n");
    revised.problem.actual = "another changed claim";
    writeFileSync(fx.path, `${JSON.stringify(revised, null, 2)}\n`);
    const rejected = bindContractAfterMutation({ cwd: fx.root, sessionId: "session-a", touchedPaths: [fx.path] });
    assert.equal(rejected.kind, "invalid");
    assert.match(rejected.findings.join("\n"), /revert production.*replan/u);
  });
});

test("timeouts, unknown results, and cross-case receipt references never prove closure", () => {
  const fx = fixture();
  bind(fx);
  withData(fx.data, () => {
    for (const outcome of ["timeout", "unknown"]) {
      const result = observeCommand({ cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs", outcome, output: "PRIMARY_REPRO" });
      assert.equal(result.kind, "ignored");
    }
    const contract = regressionContract();
    contract.status = "closed";
    contract.cases[0].receipts = { before: "BR-R999", after: "BR-R999" };
    writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
    assert.match(completionFindings(refreshBinding({ cwd: fx.root, sessionId: "session-a" })).join("\n"), /missing or forged/u);
  });
});

test("same direct command can prove multiple cases only when every signature matches", () => {
  const fx = fixture();
  const contract = regressionContract();
  contract.cases[2].command = contract.cases[0].command;
  contract.cases[2].before.includes = ["REPRESENTATION_REPRO"];
  writeFileSync(fx.path, `${JSON.stringify(contract, null, 2)}\n`);
  bind(fx);
  withData(fx.data, () => {
    const partial = observeCommand({ cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs", outcome: "failure", output: "PRIMARY_REPRO" });
    assert.deepEqual(partial.receipts.map((item) => item.caseId), ["BR-C1"]);
    const combined = observeCommand({ cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs", outcome: "failure", output: "PRIMARY_REPRO REPRESENTATION_REPRO" });
    assert.deepEqual(combined.receipts.map((item) => item.caseId), ["BR-C1", "BR-C3"]);
  });
});

test("a live lease rejects a second session and higher epoch resumes with BEFORE only", () => {
  const fx = fixture();
  bind(fx, "session-a");
  withData(fx.data, () => {
    observeCommand({ cwd: fx.root, sessionId: "session-a", command: "node test/primary.mjs", outcome: "failure", output: "PRIMARY_REPRO" });
    assert.equal(bindContractAfterMutation({ cwd: fx.root, sessionId: "session-b", touchedPaths: [fx.path] }).kind, "conflict");

    const paused = regressionContract();
    paused.status = "paused";
    writeFileSync(fx.path, `${JSON.stringify(paused, null, 2)}\n`);
    bindContractAfterMutation({ cwd: fx.root, sessionId: "session-a", touchedPaths: [fx.path] });

    paused.status = "open";
    paused.epoch = 2;
    writeFileSync(fx.path, `${JSON.stringify(paused, null, 2)}\n`);
    const resumed = bindContractAfterMutation({ cwd: fx.root, sessionId: "session-b", touchedPaths: [fx.path] });
    assert.equal(resumed.kind, "resumed");
    assert.equal(resumed.run.receipts.length, 1);
    assert.equal(resumed.run.receipts[0].phase, "before");
  });
});
