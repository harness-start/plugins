const { normalize } = require("../src/normalize.cjs");
if (normalize("legacy_alias") !== "canonical") {
  console.error("REPRESENTATION_REPRO alternate representation is broken");
  process.exit(1);
}
console.log("REPRESENTATION_FIXED");
