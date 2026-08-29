import assert from "node:assert/strict";
import test from "node:test";

test("presentation review admission carries two-pass communication evidence", () => {
  const review = { reviewerRetell: { observedBeforeContract: "The deck asks for one decision." }, communicationReview: { retellAlignment: { status: "pass" } } };
  assert.match(review.reviewerRetell.observedBeforeContract, /decision/u);
  assert.equal(review.communicationReview.retellAlignment.status, "pass");
});
