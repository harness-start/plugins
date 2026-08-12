const assert = require("node:assert/strict");
const { combineContributors } = require("../src/combine-contributors.cjs");

try {
  assert.deepEqual(combineContributors(["a"], ["b"], ["c"]), ["a", "b", "c"]);
} catch {
  console.error("PRIMARY_VARIADIC_REPRO later contributor was dropped");
  process.exit(1);
}
console.log("PRIMARY_VARIADIC_FIXED");
