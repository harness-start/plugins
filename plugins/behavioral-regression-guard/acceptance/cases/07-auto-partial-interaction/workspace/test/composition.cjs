const assert = require("node:assert/strict");
const { alignColumns } = require("../src/align-columns.cjs");

try {
  const aligned = alignColumns(["l1"], []);
  assert.deepEqual(aligned.left.map((value) => `${value}!`), ["l1!"]);
} catch {
  console.error("COMPOSITION_PARTIAL_REPRO downstream projection lost data");
  process.exit(1);
}
console.log("COMPOSITION_PARTIAL_FIXED");
