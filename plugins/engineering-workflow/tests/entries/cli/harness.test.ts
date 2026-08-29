import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../../../src/entries/cli/harness.ts", import.meta.url), "utf8");

test("owner CLI registers its in-process commands", () => {
  assert.match(source, /runOwnerCli/u);
  assert.match(source, /debugging:\s*runDebugCommand/u);
  assert.match(source, /specification:\s*runSpecificationCommand/u);
});
