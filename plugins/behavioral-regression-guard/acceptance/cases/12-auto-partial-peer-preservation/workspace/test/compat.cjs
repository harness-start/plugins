const assert = require("node:assert/strict");
const { mapChannels } = require("../src/channel-map.cjs");

assert.deepEqual(mapChannels([2], [3]), [[4], [9]]);
console.log("COMPAT_POPULATED_OK");
