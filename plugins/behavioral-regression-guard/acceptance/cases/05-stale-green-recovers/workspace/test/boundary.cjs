const { normalize } = require("../src/normalize.cjs");
if (normalize("") !== "") process.exit(1);
console.log("BOUNDARY_OK");
