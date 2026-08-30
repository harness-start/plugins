import assert from "node:assert/strict";
import { test } from "node:test";

import { handleSoftwareDebugging, shellCommandMutates } from "../../src/domains/debugging/hook.js";

test("debugging guard exposes an import-safe owner handler", () => {
  assert.equal(typeof handleSoftwareDebugging, "function");
});

test("shell mutation classification respects quoted greater-than characters", () => {
  assert.equal(shellCommandMutates("echo \"$f -> $t\""), false);
  assert.equal(shellCommandMutates("echo value > result.txt"), true);
});
