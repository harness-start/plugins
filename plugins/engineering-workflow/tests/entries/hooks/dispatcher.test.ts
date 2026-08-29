import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../../../src/entries/hooks/dispatcher.ts", import.meta.url), "utf8");

test("owner dispatcher registers all three in-process handlers", () => {
  assert.match(source, /runOwnerDispatcher/u);
  assert.match(source, /debugging:\s*handleSoftwareDebugging/u);
  assert.match(source, /specification:\s*handleSpecification/u);
  assert.match(source, /testing:\s*handleTesting/u);
});
