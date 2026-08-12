const assert = require("node:assert/strict");
const { normalizeToken } = require("../src/normalize-token.cjs");

try {
  assert.equal(normalizeToken("Alpha\tBeta"), "alpha-beta");
} catch {
  console.error("REPRESENTATION_TAB_REPRO tab separator remains");
  process.exit(1);
}
console.log("REPRESENTATION_TAB_FIXED");
