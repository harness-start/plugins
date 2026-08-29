import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("presentation shell canonical paths have an explicit string contract", () => {
  const source = readFileSync(resolve(import.meta.dirname, "../../../../src/domains/presentation/lib/shell-policy.ts"), "utf8");
  assert.match(source, /function canonicalPath\(path: string\): string/u);
});
