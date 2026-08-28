import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { discoverTypeScriptTests, runTypeScriptTests } from "../../../scripts/run-tests.js";

test("default test discovery includes direct and nested TypeScript tests", () => {
  const files = discoverTypeScriptTests();

  for (const expected of [
    "core/tests/unit/test-discovery.test.ts",
    "plugins/artifact-production/modules/logo/tests/hook.test.ts",
    "plugins/artifact-production/modules/logo/tests/lib/codex-review-identity.test.ts",
    "plugins/delivery-governance/modules/ci/tests/entries/hooks/ci-gated-delivery.test.ts",
  ]) {
    assert.ok(files.includes(expected), expected);
  }
  assert.deepEqual(files, files.toSorted());
  assert.equal(files.some((file) => file.includes("/acceptance/")), false);
});

test("test runner propagates a failing child test exit code", (context) => {
  const root = mkdtempSync(join(tmpdir(), "run-tests-failure-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, "failure.test.ts"),
    'import assert from "node:assert/strict"; import test from "node:test"; test("fails", () => assert.fail("expected"));\n',
  );
  assert.equal(runTypeScriptTests(["failure.test.ts"], root, "pipe"), 1);
});
