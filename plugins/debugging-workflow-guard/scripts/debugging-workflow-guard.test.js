import assert from "node:assert/strict";
import { test } from "node:test";

import { main as hookMain } from "./debugging-workflow-guard.mjs";

test("debugging guard exposes an import-safe public hook entry", () => {
  assert.equal(typeof hookMain, "function");
});
