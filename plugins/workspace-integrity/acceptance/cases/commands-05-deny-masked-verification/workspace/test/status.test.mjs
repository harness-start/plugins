import assert from "node:assert/strict";
import { test } from "node:test";

test("synthetic verifier failure remains visible", () => {
  assert.equal("actual", "expected");
});
