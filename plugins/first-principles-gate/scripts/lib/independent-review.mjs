import { createHash, randomBytes } from "node:crypto";

export function parseReviewRequest(text) {
  return /\bFP_REVIEW_REQUEST\s+challenger\b/u.test(String(text ?? "")) ? { stage: "challenger" } : null;
}

export function parseReviewResult(text) {
  const match = /\bFP_REVIEW_RESULT\s+(\{[\s\S]*\})\s*$/mu.exec(String(text ?? "").trim());
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    if (value?.stage !== "challenger") return { __invalid: true, __reason: "stage must be challenger" };
    if (typeof value.reviewNonce !== "string" || !/^[a-f0-9]{16,}$/iu.test(value.reviewNonce)) {
      return { __invalid: true, __reason: "reviewNonce must be the hook-issued hex nonce" };
    }
    if (!["approve", "challenge"].includes(value.decision)) return { __invalid: true, __reason: "decision must be approve or challenge" };
    return value;
  } catch {
    return { __invalid: true, __reason: "FP_REVIEW_RESULT must be one JSON object" };
  }
}

export function ledgerFingerprint(raw) {
  return createHash("sha256").update(String(raw ?? "")).digest("hex");
}

export function reserveReview(state, fingerprint) {
  if (!fingerprint) return { kind: "rejected", reason: "ledger fingerprint is unavailable" };
  if (state.reviewReservation && ["reserved", "bound"].includes(state.reviewReservation.state)) {
    return { kind: "rejected", reason: "challenger review is already reserved or bound" };
  }
  if (state.review?.decision === "approve" && state.review.fingerprint === fingerprint) {
    return { kind: "rejected", reason: "current challenger approval already matches the ledger; reuse it" };
  }
  state.reviewReservation = {
    state: "reserved",
    stage: "challenger",
    nonce: randomBytes(12).toString("hex"),
    fingerprint,
    agentId: null,
  };
  return { kind: "reserved", reservation: state.reviewReservation };
}

export function bindReviewer(state, agentId) {
  const reservation = state.reviewReservation;
  if (!reservation || !["reserved", "bound"].includes(reservation.state)) {
    return { kind: "rejected", reason: "no reserved independent review exists" };
  }
  if (!agentId) return { kind: "rejected", reason: "reviewer agent_id is missing" };
  if (reservation.state === "bound" && reservation.agentId !== agentId) {
    return { kind: "rejected", reason: "review reservation is already bound to a different agent" };
  }
  reservation.state = "bound";
  reservation.agentId = agentId;
  return { kind: "bound-reviewer", reservation };
}

export function observeReview(state, { agentId, result }) {
  if (result?.__invalid) return { kind: "rejected", reason: result.__reason };
  const reservation = state.reviewReservation;
  if (!reservation || reservation.state !== "bound") return { kind: "rejected", reason: "review result arrived without a bound reviewer" };
  if (reservation.agentId !== agentId || reservation.nonce !== result.reviewNonce) {
    return { kind: "rejected", reason: "review card does not match the bound reservation" };
  }
  state.reviewReservation = null;
  if (result.decision !== "approve") {
    state.review = null;
    return { kind: "review-recorded", receipt: { stage: "challenger", decision: "challenge", agentId } };
  }
  state.review = { decision: "approve", agentId, nonce: reservation.nonce, fingerprint: reservation.fingerprint };
  return { kind: "review-recorded", receipt: state.review };
}

export function reviewSatisfied(state, fingerprint) {
  return state.review?.decision === "approve" && state.review.fingerprint === fingerprint;
}
