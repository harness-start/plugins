import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("production source contains no debug marker", async () => {
  const source = await readFile(new URL("../src/value.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /DBG_/u);
});
