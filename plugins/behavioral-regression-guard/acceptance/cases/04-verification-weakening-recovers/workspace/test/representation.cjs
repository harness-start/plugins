const { normalize } = require("../src/normalize.cjs");
if (normalize(" LEGACY ") !== "canonical") {
  console.error("REPRESENTATION_REPRO alternate representation is broken");
  process.exit(1);
}
console.log("REPRESENTATION_FIXED");
