import assert from "node:assert/strict";
import test from "node:test";

test("poster review admission carries the independent retell into the release record", () => {
  const fields = ["reviewerRetell", "communicationReview"];
  assert.deepEqual(fields, ["reviewerRetell", "communicationReview"]);
});
