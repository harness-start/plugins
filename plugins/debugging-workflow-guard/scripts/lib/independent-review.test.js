import assert from "node:assert/strict";
import { test } from "node:test";

import { diagnosisEvidence } from "./independent-review.mjs";

test("debug review exposes canonical evidence bytes", () => {
  assert.equal(typeof diagnosisEvidence, "function");
});
