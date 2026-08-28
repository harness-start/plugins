import assert from "node:assert/strict";
import { test } from "node:test";

import { cap } from "../src/cap.mjs";

test("preserves a positive value", () => {
  assert.equal(cap(4), 4);
});
