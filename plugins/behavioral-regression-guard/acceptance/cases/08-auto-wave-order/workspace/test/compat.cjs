const assert = require("node:assert/strict");
const { mergeSequences } = require("../src/merge-sequences.cjs");

assert.deepEqual(mergeSequences([["A", "B", "C"]]), ["A", "B", "C"]);
console.log("COMPAT_SINGLE_CHAIN_OK");
