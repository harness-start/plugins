import assert from "node:assert/strict";
import { test } from "node:test";

import { reviewEvidenceSnapshot } from "./independent-review.mjs";

test("review evidence exposes a same-bytes snapshot seam", () => {
  assert.equal(typeof reviewEvidenceSnapshot, "function");
});
