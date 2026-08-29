import assert from "node:assert/strict";
import { test } from "node:test";

import { main } from "../../src/domains/debugging/command.js";

test("debugging command exposes an import-safe owner command", () => {
  assert.equal(typeof main, "function");
});
