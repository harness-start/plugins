const assert = require("node:assert/strict");
const { mergeSequences } = require("../src/merge-sequences.cjs");

assert.deepEqual(mergeSequences([["A", "B", "D"], ["A", "C", "D"]]), ["A", "B", "C", "D"]);
console.log("ORDER_SHARED_OK");
