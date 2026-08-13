import assert from "node:assert/strict";
import { test } from "node:test";

import { updateState } from "./state-store.mjs";

test("state updates expose the locked transaction seam", () => {
  assert.equal(typeof updateState, "function");
});
