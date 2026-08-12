const assert = require("node:assert/strict");
const { alignColumns } = require("../src/align-columns.cjs");

try {
  assert.deepEqual(alignColumns([], ["r1"]), { left: [], right: ["r1"] });
} catch {
  console.error("PRIMARY_PARTIAL_REPRO populated peer was discarded");
  process.exit(1);
}
console.log("PRIMARY_PARTIAL_FIXED");
