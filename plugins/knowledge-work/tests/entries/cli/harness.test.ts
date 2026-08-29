import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("harness uses fused owner CLI handlers", () => {
  const source = readFileSync(resolve(import.meta.dirname, "../../../src/entries/cli/harness.ts"), "utf8");
  assert.match(source, /runOwnerCli/u);
  assert.doesNotMatch(source, /runAioCli/u);
});
