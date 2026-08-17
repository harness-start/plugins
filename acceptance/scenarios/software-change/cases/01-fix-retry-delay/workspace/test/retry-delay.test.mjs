import assert from "node:assert/strict";
import { test } from "node:test";

import { retryDelay } from "../src/retry-delay.mjs";

test("returns the base delay for the first retry", () => {
  assert.equal(retryDelay(1), 100);
});

test("doubles the delay for each later retry until the cap", () => {
  assert.equal(retryDelay(2), 200);
  assert.equal(retryDelay(5), 1600);
  assert.equal(retryDelay(6), 1600);
});

test("rejects attempts before the first retry", () => {
  assert.throws(() => retryDelay(0), RangeError);
});
