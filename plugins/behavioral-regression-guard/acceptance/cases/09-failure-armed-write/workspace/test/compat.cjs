const assert = require("node:assert/strict");
const { normalizeToken } = require("../src/normalize-token.cjs");

assert.equal(normalizeToken("alpha-beta"), "alpha-beta");
console.log("COMPAT_CANONICAL_OK");
