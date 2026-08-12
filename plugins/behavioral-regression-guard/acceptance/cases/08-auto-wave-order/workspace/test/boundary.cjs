const assert = require("node:assert/strict");
const { mergeSequences } = require("../src/merge-sequences.cjs");

assert.deepEqual(mergeSequences([]), []);
console.log("BOUNDARY_EMPTY_OK");
