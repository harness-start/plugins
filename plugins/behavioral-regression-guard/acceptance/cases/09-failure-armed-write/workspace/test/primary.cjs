const assert = require("node:assert/strict");
const { normalizeToken } = require("../src/normalize-token.cjs");

try {
  assert.equal(normalizeToken("  Alpha   Beta  "), "alpha-beta");
} catch {
  console.error("PRIMARY_SPACING_REPRO repeated separators remain");
  process.exit(1);
}
console.log("PRIMARY_SPACING_FIXED");
