import assert from "node:assert/strict";
import { test } from "node:test";

import { updateState } from "../src/lib/state-store.js";

test("state updates expose the locked transaction seam", () => {
  assert.equal(typeof updateState, "function");
});
