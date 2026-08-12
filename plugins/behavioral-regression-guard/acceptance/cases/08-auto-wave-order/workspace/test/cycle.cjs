const assert = require("node:assert/strict");
const { mergeSequences } = require("../src/merge-sequences.cjs");

assert.throws(() => mergeSequences([["A", "B"], ["B", "A"]]), /cycle/u);
console.log("ERROR_CYCLE_OK");
