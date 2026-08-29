import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("research workflow exports the owner CLI command", () => {
  const source = readFileSync(resolve(import.meta.dirname, "../../../../../src/domains/research/entries/cli/research-workflow.ts"), "utf8");
  assert.match(source, /export async function main/u);
});
