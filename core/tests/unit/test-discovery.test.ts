import assert from "node:assert/strict";
import { test } from "node:test";

import { discoverTypeScriptTests } from "../../../scripts/run-tests.js";

test("default test discovery includes direct and nested TypeScript tests", () => {
  const files = discoverTypeScriptTests();

  for (const expected of [
    "core/tests/unit/test-discovery.test.ts",
    "plugins/brand-logo-production/tests/hook.test.ts",
    "plugins/brand-logo-production/tests/lib/codex-review-identity.test.ts",
    "plugins/ci-gated-delivery/tests/entries/hooks/ci-gated-delivery.test.ts",
  ]) {
    assert.ok(files.includes(expected), expected);
  }
  assert.deepEqual(files, files.toSorted());
  assert.equal(files.some((file) => file.includes("/acceptance/")), false);
});
