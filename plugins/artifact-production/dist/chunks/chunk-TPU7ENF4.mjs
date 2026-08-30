// harness-source-hash: sha256:aa55e37b578bd1016a6403462a3f72057de2a4fa7baa3013af84343c8e6ab3f1

// plugins/artifact-production/src/lib/communication-contract.ts
var COMMUNICATION_REVIEW_KEYS = [
  "coreFidelity",
  "signatureCue",
  "semanticCausality",
  "retellAlignment",
  "invariantContinuity"
];
var isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
var nonEmptyStrings = (value) => Array.isArray(value) && value.length > 0 && value.every(nonEmpty);
function communicationCoreValid(value) {
  if (!isRecord(value)) return false;
  const cue = isRecord(value.signatureCue) ? value.signatureCue : void 0;
  return ["coreIntent", "audienceOutcome", "retellTarget", "semanticLink"].every((key) => nonEmpty(value[key])) && Boolean(cue) && nonEmpty(cue?.description) && nonEmpty(cue?.semanticRole) && nonEmptyStrings(cue?.anchors) && new Set(cue?.anchors).size === (cue?.anchors).length && nonEmptyStrings(value.invariants) && nonEmptyStrings(value.prohibitedDrift);
}
function communicationAnchors(value) {
  if (!communicationCoreValid(value)) return [];
  const cue = value.signatureCue;
  return [...cue.anchors];
}
function communicationReviewValid(review, intendedTarget, allowedAnchors) {
  if (!isRecord(review) || !nonEmpty(intendedTarget) || !nonEmptyStrings(allowedAnchors)) return false;
  const retell = isRecord(review.reviewerRetell) ? review.reviewerRetell : void 0;
  const checks = isRecord(review.communicationReview) ? review.communicationReview : void 0;
  const anchorSet = new Set(allowedAnchors);
  return Boolean(retell) && nonEmpty(retell?.observedBeforeContract) && retell?.intendedTarget === intendedTarget && retell?.alignment === "pass" && nonEmpty(retell?.limitation) && Boolean(checks) && COMMUNICATION_REVIEW_KEYS.every((key) => {
    const check = isRecord(checks?.[key]) ? checks[key] : void 0;
    return check?.status === "pass" && nonEmpty(check.anchor) && anchorSet.has(check.anchor) && nonEmpty(check.evidence) && nonEmpty(check.recovery);
  });
}

export {
  communicationCoreValid,
  communicationAnchors,
  communicationReviewValid
};
