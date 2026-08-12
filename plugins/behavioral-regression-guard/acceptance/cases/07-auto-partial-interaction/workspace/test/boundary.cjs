const assert = require("node:assert/strict");
const { alignColumns } = require("../src/align-columns.cjs");

assert.deepEqual(alignColumns([], []), { left: [], right: [] });
console.log("BOUNDARY_EMPTY_OK");
