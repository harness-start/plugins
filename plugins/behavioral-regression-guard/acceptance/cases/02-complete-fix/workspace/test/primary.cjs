const { normalize } = require("../src/normalize.cjs");
if (normalize("legacy") !== "canonical") {
  console.error("PRIMARY_REPRO legacy normalization is broken");
  process.exit(1);
}
console.log("PRIMARY_FIXED");
