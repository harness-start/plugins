import assert from "node:assert/strict";
import test from "node:test";

import {
  communicationAnchors,
  communicationCoreValid,
  communicationReviewValid,
} from "../../src/lib/communication-contract.js";

const core = {
  coreIntent: "Explain one operating transformation.",
  audienceOutcome: "Readers can identify the decision.",
  retellTarget: "One signal becomes coordinated work.",
  signatureCue: { description: "A branching signal", semanticRole: "Operating transformation", anchors: ["beat:explain"] },
  semanticLink: "The branch directly depicts coordination.",
  invariants: ["the signal remains traceable"],
  prohibitedDrift: ["decorative motion without state change"],
};

test("validates a complete communication core and returns its unique anchors", () => {
  assert.equal(communicationCoreValid(core), true);
  assert.deepEqual(communicationAnchors(core), ["beat:explain"]);
  assert.equal(communicationCoreValid({ ...core, semanticLink: "" }), false);
  assert.equal(communicationCoreValid({ ...core, signatureCue: { ...core.signatureCue, anchors: ["beat:explain", "beat:explain"] } }), false);
});

test("requires a two-pass retell and every evidence-bearing communication check", () => {
  const communicationReview = Object.fromEntries(["coreFidelity", "signatureCue", "semanticCausality", "retellAlignment", "invariantContinuity"].map((key) => [key, { status: "pass", anchor: "beat:explain", evidence: `${key} is visible.`, recovery: `Revise ${key}.` }]));
  const review = { reviewerRetell: { observedBeforeContract: "A signal becomes coordinated work.", intendedTarget: core.retellTarget, alignment: "pass", limitation: "Independent reviewer proxy; not a human recall study." }, communicationReview };
  assert.equal(communicationReviewValid(review, core.retellTarget, core.signatureCue.anchors), true);
  communicationReview.signatureCue.anchor = "beat:missing";
  assert.equal(communicationReviewValid(review, core.retellTarget, core.signatureCue.anchors), false);
  communicationReview.signatureCue.anchor = "beat:explain";
  delete communicationReview.semanticCausality;
  assert.equal(communicationReviewValid(review, core.retellTarget, core.signatureCue.anchors), false);
});
