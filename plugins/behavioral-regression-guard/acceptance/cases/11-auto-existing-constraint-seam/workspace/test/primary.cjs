const assert = require("node:assert/strict");
const { OrderPlan } = require("../src/order-plan.cjs");

try {
  const combined = new OrderPlan(["C"]).plus(new OrderPlan(["A"])).plus(new OrderPlan(["A", "B", "C"]));
  assert.deepEqual(combined.resolved, ["A", "B", "C"]);
} catch {
  console.error("PRIMARY_COMPOSITION_REPRO pairwise intermediate invented an order");
  process.exit(1);
}
console.log("PRIMARY_COMPOSITION_FIXED");
