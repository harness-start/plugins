import { createHash, randomBytes } from "node:crypto";

export const REVIEW_STAGES = Object.freeze(["diagnosis", "architecture"]);

export function parseReviewRequest(text) {
  const match = /\bDBG_REVIEW_REQUEST\s+(diagnosis|architecture)\b/u.exec(String(text ?? ""));
  return match ? { stage: match[1] } : null;
}

export function parseReviewResult(text) {
  const match = /\bDBG_REVIEW_RESULT\s+(\{[\s\S]*\})\s*$/mu.exec(String(text ?? "").trim());
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    if (!REVIEW_STAGES.includes(value?.stage)) return { __invalid: true, __reason: "unknown review stage" };
    if (typeof value.reviewNonce !== "string" || !/^[a-f0-9]{16,}$/iu.test(value.reviewNonce)) {
      return { __invalid: true, __reason: "reviewNonce must be the hook-issued hex nonce" };
    }
    if (!["approve", "challenge"].includes(value.decision)) return { __invalid: true, __reason: "decision must be approve or challenge" };
    return value;
  } catch {
    return { __invalid: true, __reason: "DBG_REVIEW_RESULT must be one JSON object" };
  }
}

export function diagnosisFingerprint(workOrder, state) {
  const bug = workOrder?.bugs?.find((item) => item.id === workOrder.activeBugId);
  return createHash("sha256").update(JSON.stringify({
    id: workOrder?.id,
    bug: workOrder?.activeBugId,
    root: bug?.rootCause ?? null,
    hypotheses: bug?.hypotheses ?? [],
    receipts: (state?.receipts ?? []).filter((receipt) => receipt.bugId === workOrder?.activeBugId).map((receipt) => receipt.id),
  })).digest("hex");
}

export function emptyReviews() {
  return { reservation: null, diagnosis: null, architecture: null };
}

export function reserveReview(state, { stage, fingerprint }) {
  if (!REVIEW_STAGES.includes(stage)) return { kind: "rejected", reason: "unknown independent review stage" };
  if (!fingerprint) return { kind: "rejected", reason: "review fingerprint is unavailable" };
  const current = state.reviews?.[stage];
  if (current?.decision === "approve" && current.fingerprint === fingerprint) {
    return { kind: "rejected", reason: `current ${stage} approval already matches the frozen work order; reuse it` };
  }
  state.reviews = state.reviews ?? emptyReviews();
  state.reviews.reservation = {
    state: "reserved",
    stage,
    nonce: randomBytes(12).toString("hex"),
    fingerprint,
    agentId: null,
  };
  return { kind: "reserved", reservation: state.reviews.reservation };
}

export function bindReviewer(state, { stage, agentId }) {
  const reservation = state.reviews?.reservation;
  if (!reservation || reservation.stage !== stage || !["reserved", "bound"].includes(reservation.state)) {
    return { kind: "rejected", reason: "no reserved independent review exists" };
  }
  if (!agentId) return { kind: "rejected", reason: "reviewer agent_id is missing" };
  if (stage === "architecture" && state.reviews?.diagnosis?.agentId === agentId) {
    return { kind: "rejected", reason: "architecture reviewer must be a different agent than the diagnosis reviewer" };
  }
  reservation.state = "bound";
  reservation.agentId = agentId;
  return { kind: "bound-reviewer", reservation };
}

export function observeReview(state, { agentId, result }) {
  if (result?.__invalid) return { kind: "rejected", reason: result.__reason };
  const reservation = state.reviews?.reservation;
  if (!reservation || reservation.state !== "bound") return { kind: "rejected", reason: "review result arrived without a bound reviewer" };
  if (reservation.agentId !== agentId) return { kind: "rejected", reason: "review result came from a different subagent" };
  if (reservation.nonce !== result.reviewNonce || reservation.stage !== result.stage) {
    return { kind: "rejected", reason: "review card does not match the bound reservation" };
  }
  if (result.decision !== "approve") {
    state.reviews[result.stage] = null;
    state.reviews.reservation = null;
    return { kind: "review-recorded", receipt: { stage: result.stage, decision: "challenge", agentId } };
  }
  state.reviews[result.stage] = {
    decision: "approve",
    agentId,
    nonce: reservation.nonce,
    fingerprint: reservation.fingerprint,
  };
  state.reviews.reservation = null;
  return { kind: "review-recorded", receipt: state.reviews[result.stage] };
}

export function currentApproval(state, stage, fingerprint) {
  const approval = state.reviews?.[stage];
  return approval?.decision === "approve" && approval.fingerprint === fingerprint ? approval : null;
}
