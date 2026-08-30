import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("workspace integrity publishes its owner CLI entry and route", () => {
  assert.equal(existsSync(fileURLToPath(new URL("../../../src/entries/cli/harness.ts", import.meta.url))), true);
  assert.equal(existsSync(fileURLToPath(new URL("../../../routes/cli.json", import.meta.url))), true);
});
