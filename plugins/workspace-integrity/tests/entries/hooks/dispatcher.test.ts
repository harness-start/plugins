import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("dispatcher uses fused owner handlers and owner quality entries", () => {
  const root = resolve(import.meta.dirname, "../../../src/entries/hooks");
  const source = readFileSync(resolve(root, "dispatcher.ts"), "utf8");
  assert.match(source, /runOwnerDispatcher/u);
  assert.doesNotMatch(source, /runAioDispatcher/u);
  assert.match(readFileSync(resolve(root, "line-budget-check.ts"), "utf8"), /domains\/quality/u);
  assert.match(readFileSync(resolve(root, "markdown-check.ts"), "utf8"), /domains\/quality/u);
});
