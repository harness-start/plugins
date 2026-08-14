import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeText } from "../src/normalize-text.mjs";

test("returns the empty marker for whitespace-only input", () => {
  assert.equal(normalizeText("  \t  "), "(empty)");
});

test("keeps the public normalization behavior for ordinary input", () => {
  assert.equal(normalizeText("  two words  "), "two words");
});
