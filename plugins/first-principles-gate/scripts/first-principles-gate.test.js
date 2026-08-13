import assert from "node:assert/strict";
import { test } from "node:test";

import { runPre } from "./first-principles-gate.mjs";

test("first-principles hook exposes an import-safe public seam", () => {
  assert.equal(typeof runPre, "function");
});
