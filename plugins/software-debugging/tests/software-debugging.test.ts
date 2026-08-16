import assert from "node:assert/strict";
import { test } from "node:test";

import { main as hookMain } from "../src/entries/hooks/software-debugging.js";

test("debugging guard exposes an import-safe public hook entry", () => {
  assert.equal(typeof hookMain, "function");
});
