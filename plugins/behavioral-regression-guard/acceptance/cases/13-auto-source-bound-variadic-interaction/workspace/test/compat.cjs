const assert = require("node:assert/strict");
const { transform } = require("../src/transform.cjs");

assert.deepEqual(transform([[1, 2], [3, 4]], 2), [[2, 4], [6, 8]]);
assert.deepEqual(transform([1, 2], [3, 4], 2), [[2, 4], [6, 8]]);
console.log("PROJECT_COMPAT_OK");
