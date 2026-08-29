import assert from "node:assert/strict";
import { test } from "node:test";

import { handleSoftwareDebugging } from "../../src/domains/debugging/hook.js";

test("debugging guard exposes an import-safe owner handler", () => {
  assert.equal(typeof handleSoftwareDebugging, "function");
});
