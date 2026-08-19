import assert from "node:assert/strict";
import { test } from "node:test";

import { Pipeline } from "../src/pipeline.mjs";

test("preserves the existing two-group combination contract", () => {
  Pipeline.clearWarnings();
  assert.deepEqual(Pipeline.combine(["prepare", "verify"], ["verify", "publish"]), [
    "prepare",
    "verify",
    "publish",
  ]);
  assert.deepEqual(Pipeline.warnings, []);
});

test("warns for genuinely opposite pairwise constraints", () => {
  Pipeline.clearWarnings();
  assert.deepEqual(Pipeline.combine(["first", "second"], ["second", "first"]), ["first", "second"]);
  assert.equal(Pipeline.warnings.length, 1);
});
