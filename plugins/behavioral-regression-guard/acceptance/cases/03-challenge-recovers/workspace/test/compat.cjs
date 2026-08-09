const { normalize } = require("../src/normalize.cjs");
if (normalize(" OK ") !== "ok") process.exit(1);
console.log("COMPAT_OK");
