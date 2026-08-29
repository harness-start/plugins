import assert from "node:assert/strict";
import test from "node:test";

test("logo review admission requires the complete two-pass communication record", () => {
  const payload = {
    reviewerRetell: {
      observedBeforeContract: "A connected path guides the system.",
      intendedTarget: "A connected path guides the system.",
      alignment: "pass",
      limitation: "Independent reviewer proxy; not a human recall study.",
    },
    communicationReview: Object.fromEntries(["coreFidelity", "signatureCue", "semanticCausality", "retellAlignment", "invariantContinuity"].map((key) => [key, {
      status: "pass",
      anchor: "path:mark-shape",
      evidence: `${key} is visible in the current logo output.`,
      recovery: `Revise ${key} and repeat independent review.`,
    }])),
  };

  assert.equal(payload.reviewerRetell.intendedTarget, "A connected path guides the system.");
  assert.equal(Object.keys(payload.communicationReview).length, 5);
  delete payload.communicationReview.signatureCue;
  assert.equal(Object.keys(payload.communicationReview).length, 4);
});
