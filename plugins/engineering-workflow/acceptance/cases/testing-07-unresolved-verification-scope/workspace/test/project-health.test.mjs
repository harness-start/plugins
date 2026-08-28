import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("records completed project verification", () => {
  const marker = readFileSync(new URL("../QUALITY.txt", import.meta.url), "utf8").trim();
  assert.equal(marker, "verified");
});
