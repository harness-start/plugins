import assert from "node:assert/strict";
import test from "node:test";

import { canAllocate } from "../src/allocation.mjs";

test("allocation fits at or below the remaining capacity", () => {
  assert.equal(canAllocate(4, 4), true);
  assert.equal(canAllocate(5, 4), false);
  assert.equal(canAllocate(0, 0), true);
});
