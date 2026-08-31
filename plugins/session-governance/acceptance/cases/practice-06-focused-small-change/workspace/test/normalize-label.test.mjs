import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeLabel } from "../src/normalize-label.mjs";

test("trims a non-empty label", () => {
  assert.equal(normalizeLabel(" ready "), "ready");
});
