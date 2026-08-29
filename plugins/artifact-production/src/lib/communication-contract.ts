export type CommunicationRecord = Record<string, unknown>;

export const COMMUNICATION_REVIEW_KEYS = [
  "coreFidelity",
  "signatureCue",
  "semanticCausality",
  "retellAlignment",
  "invariantContinuity",
] as const;

const isRecord = (value: unknown): value is CommunicationRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const nonEmptyStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every(nonEmpty);

export function communicationCoreValid(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const cue = isRecord(value.signatureCue) ? value.signatureCue : undefined;
  return ["coreIntent", "audienceOutcome", "retellTarget", "semanticLink"].every((key) => nonEmpty(value[key]))
    && Boolean(cue)
    && nonEmpty(cue?.description)
    && nonEmpty(cue?.semanticRole)
    && nonEmptyStrings(cue?.anchors)
    && new Set(cue?.anchors as string[]).size === (cue?.anchors as string[]).length
    && nonEmptyStrings(value.invariants)
    && nonEmptyStrings(value.prohibitedDrift);
}

export function communicationAnchors(value: unknown): string[] {
  if (!communicationCoreValid(value)) return [];
  const cue = (value as CommunicationRecord).signatureCue as CommunicationRecord;
  return [...(cue.anchors as string[])];
}

export function communicationReviewValid(review: unknown, intendedTarget: unknown, allowedAnchors: readonly string[]): boolean {
  if (!isRecord(review) || !nonEmpty(intendedTarget) || !nonEmptyStrings(allowedAnchors)) return false;
  const retell = isRecord(review.reviewerRetell) ? review.reviewerRetell : undefined;
  const checks = isRecord(review.communicationReview) ? review.communicationReview : undefined;
  const anchorSet = new Set(allowedAnchors);
  return Boolean(retell)
    && nonEmpty(retell?.observedBeforeContract)
    && retell?.intendedTarget === intendedTarget
    && retell?.alignment === "pass"
    && nonEmpty(retell?.limitation)
    && Boolean(checks)
    && COMMUNICATION_REVIEW_KEYS.every((key) => {
      const check = isRecord(checks?.[key]) ? checks[key] as CommunicationRecord : undefined;
      return check?.status === "pass"
        && nonEmpty(check.anchor)
        && anchorSet.has(check.anchor)
        && nonEmpty(check.evidence)
        && nonEmpty(check.recovery);
    });
}
