import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("owner exposes the Markdown internal entry", () => {
  assert.ok(existsSync(resolve(import.meta.dirname, "../../../src/entries/hooks/markdown-check.ts")));
});
