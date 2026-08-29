import assert from "node:assert/strict";
import { test } from "node:test";

import { runPostToolUse } from "../../../../../src/domains/writing/entries/hooks/professional-writing.js";

test("professional writing Hook remains an import-safe owner handler", () => {
  assert.equal(typeof runPostToolUse, "function");
});
