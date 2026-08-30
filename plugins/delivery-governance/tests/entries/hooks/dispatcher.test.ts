import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("dispatcher uses fused owner handlers", () => {
  const source = readFileSync(resolve(import.meta.dirname, "../../../src/entries/hooks/dispatcher.ts"), "utf8");
  assert.match(source, /runOwnerDispatcher/u);
  assert.match(source, /git:git-delivery-hook-stop/u);
  assert.doesNotMatch(source, /runAioDispatcher/u);
});
