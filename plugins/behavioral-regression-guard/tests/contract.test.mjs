import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { planDigest, validateContract } from "../scripts/lib/contract.mjs";
import { fingerprintPaths } from "../scripts/lib/fingerprint.mjs";
import { regressionContract } from "./fixtures.mjs";

test("contract requires one primary, two distinct challenges, and one invariant", () => {
  assert.deepEqual(validateContract(regressionContract()).findings, []);

  const missing = regressionContract();
  missing.cases = missing.cases.slice(0, 3);
  assert.match(validateContract(missing).findings.join("\n"), /invariant/u);

  const duplicateDimensions = regressionContract();
  duplicateDimensions.cases[2].dimension = "boundary";
  assert.match(validateContract(duplicateDimensions).findings.join("\n"), /distinct dimensions/u);
});

test("contract requires a primary RED to GREEN transition with distinguishable literal oracles", () => {
  const noPrimaryTransition = regressionContract();
  noPrimaryTransition.cases[0].before.outcome = "success";
  assert.match(validateContract(noPrimaryTransition).findings.join("\n"), /primary.*failure.*success/u);

  const ambiguousOracle = regressionContract();
  ambiguousOracle.cases[0].after.includes = [...ambiguousOracle.cases[0].before.includes];
  assert.match(validateContract(ambiguousOracle).findings.join("\n"), /distinct literal signatures/u);
});

test("contract rejects unknown fields, unsafe paths, and unbounded scope", () => {
  const unknown = regressionContract();
  unknown.surprise = true;
  assert.match(validateContract(unknown).findings.join("\n"), /unknown field: surprise/u);

  const traversal = regressionContract();
  traversal.scope.productionPaths = ["../outside.js"];
  assert.match(validateContract(traversal).findings.join("\n"), /workspace-relative/u);

  const duplicate = regressionContract();
  duplicate.scope.verificationPaths.push("test/primary.mjs");
  assert.match(validateContract(duplicate).findings.join("\n"), /duplicate/u);

  const tooMany = regressionContract();
  tooMany.scope.verificationPaths = Array.from({ length: 21 }, (_, index) => `test/${index}.mjs`);
  assert.match(validateContract(tooMany).findings.join("\n"), /at most 20/u);
});

test("direct commands reject shell composition and ambiguous byte sequences", () => {
  for (const command of [
    "node test/primary.mjs | tee output.log",
    "node test/primary.mjs > output.log",
    "node test/primary.mjs && echo ok",
    "node test/primary.mjs; echo ok",
    "node `printf test/primary.mjs`",
    "node $(printf test/primary.mjs)",
    "node test/primary.mjs\nnode test/compat.mjs",
  ]) {
    const value = regressionContract();
    value.cases[0].command = command;
    assert.match(validateContract(value).findings.join("\n"), /direct command/u, command);
  }
});

test("plan digest excludes lifecycle and receipts but binds behavior and scope", () => {
  const original = regressionContract();
  const dynamic = structuredClone(original);
  dynamic.status = "closed";
  dynamic.recovery.nextAction = "done";
  dynamic.cases[0].receipts = { before: "BR-R1", after: "BR-R5" };
  assert.equal(planDigest(dynamic), planDigest(original));

  const changed = structuredClone(original);
  changed.cases[0].after.includes = ["A_DIFFERENT_RESULT"];
  assert.notEqual(planDigest(changed), planDigest(original));
});

test("fingerprints cover file bytes, missing files, and reject symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "behavioral-fingerprint-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "value.txt"), "one\n");
  const first = fingerprintPaths(root, ["src/value.txt", "src/missing.txt"], { allowMissing: true });
  writeFileSync(join(root, "src", "value.txt"), "two\n");
  const second = fingerprintPaths(root, ["src/value.txt", "src/missing.txt"], { allowMissing: true });
  assert.equal(first.ok, true);
  assert.notEqual(first.digest, second.digest);

  symlinkSync(join(root, "src", "value.txt"), join(root, "src", "link.txt"));
  assert.match(fingerprintPaths(root, ["src/link.txt"]).findings.join("\n"), /symlink/u);
});
