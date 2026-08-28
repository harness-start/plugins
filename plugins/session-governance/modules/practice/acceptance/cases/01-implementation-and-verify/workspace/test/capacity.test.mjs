import assert from "node:assert/strict";
import { test } from "node:test";

import { canAllocate } from "../src/capacity.mjs";

test("allows a request equal to remaining capacity", () => {
  assert.equal(canAllocate(4, 4), true);
});
