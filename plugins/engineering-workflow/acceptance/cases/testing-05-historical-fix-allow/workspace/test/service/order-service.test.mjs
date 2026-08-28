import assert from "node:assert/strict";
import test from "node:test";
import { createOrder, orderTotal } from "../../src/service/order-service.mjs";

test("creates an order", () => {
  assert.equal(createOrder("A1").id, "A1");
});

test("totals the order", () => {
  assert.equal(orderTotal({ items: [2, 3] }), 5);
});
