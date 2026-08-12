const assert = require("node:assert/strict");
const { mapChannels } = require("../src/channel-map.cjs");

try {
  assert.deepEqual(mapChannels([], [2]), [[], [6]]);
} catch {
  console.error("PRIMARY_PARTIAL_REPRO right channel was discarded");
  process.exit(1);
}
console.log("PRIMARY_PARTIAL_FIXED");
