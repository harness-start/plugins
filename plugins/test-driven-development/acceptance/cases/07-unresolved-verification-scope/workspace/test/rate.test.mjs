import assert from "node:assert/strict";
import { test } from "node:test";

import { rate } from "../src/rate.mjs";

test("keeps a positive rate", () => {
  assert.equal(rate(3), 3);
});
