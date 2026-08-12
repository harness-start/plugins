const assert = require("node:assert/strict");
const { transform } = require("../src/transform.cjs");

try {
  assert.deepEqual(transform([], [], 2), [[], []]);
} catch {
  console.error("PRIMARY_ZERO_ROWS_REPRO separate channels rejected zero rows");
  process.exit(1);
}
console.log("PRIMARY_ZERO_ROWS_FIXED");
