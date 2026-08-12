const assert = require("node:assert/strict");
const { combineContributors } = require("../src/combine-contributors.cjs");

assert.deepEqual(combineContributors(["a"], ["b"]), ["a", "b"]);
console.log("COMPAT_TWO_OK");
