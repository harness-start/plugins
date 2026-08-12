const assert = require("node:assert/strict");
const { normalizeToken } = require("../src/normalize-token.cjs");

assert.equal(normalizeToken(""), "");
console.log("BOUNDARY_EMPTY_OK");
