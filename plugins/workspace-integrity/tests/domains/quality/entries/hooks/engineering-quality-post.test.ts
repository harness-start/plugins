import assert from "node:assert/strict";
import { test } from "node:test";

import { runChecks } from "../../../../../src/domains/quality/entries/hooks/engineering-quality-post.js";

test("engineering quality post Hook remains an import-safe owner handler", () => {
  assert.equal(typeof runChecks, "function");
});
