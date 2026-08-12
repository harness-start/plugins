const assert = require("node:assert/strict");
const { alignColumns } = require("../src/align-columns.cjs");

assert.deepEqual(alignColumns(["l1"], ["r1"]), { left: ["l1"], right: ["r1"] });
console.log("COMPAT_POPULATED_OK");
