import assert from "node:assert/strict";
import test from "node:test";
import { discount } from "../../src/service/discount.mjs";

test("applies the discount", () => {
  assert.equal(discount(10), 9);
});
