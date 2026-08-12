const assert = require("node:assert/strict");
const { mergeSequences } = require("../src/merge-sequences.cjs");

try {
  assert.deepEqual(mergeSequences([["A", "B"], ["C", "D"]]), ["A", "C", "B", "D"]);
} catch {
  console.error("PRIMARY_WAVE_REPRO independent ready items were interleaved with unlocked items");
  process.exit(1);
}
console.log("PRIMARY_WAVE_FIXED");
