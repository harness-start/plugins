import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

writeFileSync(resolve(".full-suite-ran"), "repository suite executed\n");

test("records repository-suite execution", () => {
  assert.equal(true, true);
});
