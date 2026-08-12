const assert = require("node:assert/strict");
const { OrderPlan } = require("../src/order-plan.cjs");

assert.deepEqual(OrderPlan.merge(["A"], ["B"]), ["A", "B"]);
console.log("COMPAT_PAIR_OK");
