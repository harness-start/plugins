import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { handleSoftwareDebugging, shellCommandMutates } from "../../src/domains/debugging/hook.js";

test("debugging guard exposes an import-safe owner handler", () => {
  assert.equal(typeof handleSoftwareDebugging, "function");
});

test("shell mutation classification respects quoted greater-than characters", () => {
  assert.equal(shellCommandMutates("echo \"$f -> $t\""), false);
  assert.equal(shellCommandMutates("echo value > result.txt"), true);
});

test("debugging method chooses a cheap discriminating probe before production mutation", () => {
  const method = readFileSync(
    resolve(import.meta.dirname, "../../skills/debug-workflow/references/systematic-debugging.md"),
    "utf8",
  );
  assert.match(method, /at least two|competing hypotheses/iu);
  assert.match(method, /falsif/iu);
  assert.match(method, /discriminat/iu);
  assert.match(method, /cost.*risk|risk.*cost/isu);
  assert.match(method, /before.*(?:production|code).*(?:change|mutation)/isu);
});
