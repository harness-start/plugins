import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { STAGE_FILES } from "./artifacts.mjs";

export const REVIEW_STAGES = Object.freeze({
  challenge: Object.freeze({
    priors: Object.freeze(["frame", "analysis"]),
    request: "RD_REVIEW_REQUEST challenge",
  }),
  "cross-check": Object.freeze({
    priors: Object.freeze(["frame", "analysis", "challenge"]),
    request: "RD_REVIEW_REQUEST cross-check",
  }),
});

export function emptyReviews() {
  return {
    challenge: { reservation: null, approval: null },
    "cross-check": { reservation: null, approval: null },
  };
}

export function parseReviewRequest(text) {
  const match = /\bRD_REVIEW_REQUEST\s+(challenge|cross-check)\b/u.exec(String(text ?? ""));
  return match ? { stage: match[1] } : null;
}

export function parseReviewResult(text) {
  const match = /\bRD_REVIEW_RESULT\s+(\{[\s\S]*\})\s*$/mu.exec(String(text ?? "").trim());
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    if (!REVIEW_STAGES[value?.stage]) return { __invalid: true, __reason: "unknown review stage" };
    if (typeof value.reviewNonce !== "string" || !/^[a-f0-9]{16,}$/iu.test(value.reviewNonce)) {
      return { __invalid: true, __reason: "reviewNonce must be the hook-issued hex nonce" };
    }
    if (!["approve", "challenge"].includes(value.decision)) {
      return { __invalid: true, __reason: "decision must be approve or challenge" };
    }
    if (!Array.isArray(value.evidenceAnchors) || value.evidenceAnchors.some((item) => typeof item !== "string" || !item.trim())) {
      return { __invalid: true, __reason: "evidenceAnchors must list the reviewed files" };
    }
    return value;
  } catch {
    return { __invalid: true, __reason: "RD_REVIEW_RESULT must be one JSON object" };
  }
}

export function reviewFingerprint(workflowPath, stage) {
  const spec = REVIEW_STAGES[stage];
  if (!spec || !workflowPath) return null;
  const hash = createHash("sha256");
  for (const prior of spec.priors) {
    const path = join(dirname(workflowPath), STAGE_FILES[prior]);
    if (!existsSync(path)) return null;
    hash.update(STAGE_FILES[prior]);
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function reviewEvidencePaths(workflowPath, stage) {
  const spec = REVIEW_STAGES[stage];
  if (!spec || !workflowPath) return [];
  return spec.priors.map((prior) => join(dirname(workflowPath), STAGE_FILES[prior]));
}

function slot(state, stage) {
  if (!state.reviews) state.reviews = emptyReviews();
  if (!state.reviews[stage]) state.reviews[stage] = { reservation: null, approval: null };
  return state.reviews[stage];
}

export function reserveReview(state, { stage, fingerprint, toolUseId }) {
  if (!REVIEW_STAGES[stage]) return { kind: "rejected", reason: "unknown independent review stage" };
  if (!fingerprint) return { kind: "rejected", reason: "review fingerprint is unavailable; finish prior stages first" };
  const current = slot(state, stage);
  if (current.approval?.decision === "approve" && current.approval.fingerprint === fingerprint) {
    return { kind: "rejected", reason: `current ${stage} approval already matches the frozen artifacts; reuse it instead of dispatching another reviewer` };
  }
  current.reservation = {
    state: "reserved",
    stage,
    nonce: randomBytes(12).toString("hex"),
    fingerprint,
    toolUseId: toolUseId || null,
    agentId: null,
  };
  return { kind: "reserved", reservation: current.reservation };
}

export function bindReviewer(state, { stage, agentId }) {
  const current = slot(state, stage);
  const reservation = current.reservation;
  if (!reservation || !["reserved", "bound"].includes(reservation.state)) {
    return { kind: "rejected", reason: "no reserved independent review exists" };
  }
  if (!agentId) return { kind: "rejected", reason: "reviewer agent_id is missing" };
  if (stage === "cross-check") {
    const challengeAgent = state.reviews?.challenge?.approval?.agentId;
    if (challengeAgent && challengeAgent === agentId) {
      return { kind: "rejected", reason: "cross-check reviewer must be a different agent than the challenge reviewer" };
    }
  }
  reservation.state = "bound";
  reservation.agentId = agentId;
  return { kind: "bound-reviewer", reservation };
}

export function reviewerBinding(state, agentId) {
  if (!agentId || !state.reviews) return { kind: "none" };
  for (const stage of Object.keys(REVIEW_STAGES)) {
    const reservation = state.reviews[stage]?.reservation;
    if (reservation?.state === "bound" && reservation.agentId === agentId) {
      return { kind: "reviewer", reservation };
    }
  }
  return { kind: "none" };
}

export function observeReview(state, { agentId, result }) {
  if (result?.__invalid) return { kind: "rejected", reason: result.__reason };
  if (!result) return { kind: "rejected", reason: "missing RD_REVIEW_RESULT" };
  const current = slot(state, result.stage);
  const reservation = current.reservation;
  if (!reservation || reservation.state !== "bound") {
    return { kind: "rejected", reason: "review result arrived without a bound reviewer" };
  }
  if (reservation.agentId !== agentId) {
    return { kind: "rejected", reason: "review result came from a different subagent" };
  }
  if (reservation.nonce !== result.reviewNonce) {
    return { kind: "rejected", reason: "reviewNonce does not match the bound reservation" };
  }
  if (result.decision !== "approve") {
    current.approval = null;
    current.reservation = null;
    return {
      kind: "review-recorded",
      receipt: { id: `RD-REV-${result.stage}`, stage: result.stage, decision: "challenge", agentId },
    };
  }
  current.approval = {
    id: `RD-REV-${result.stage}`,
    stage: result.stage,
    decision: "approve",
    agentId,
    nonce: reservation.nonce,
    fingerprint: reservation.fingerprint,
    at: Date.now(),
  };
  current.reservation = null;
  return { kind: "review-recorded", receipt: current.approval };
}

export function requiredReview(stageName) {
  return REVIEW_STAGES[stageName] ? stageName : null;
}

export function reviewRequirement(state, stageName, workflowPath) {
  const stage = requiredReview(stageName);
  if (!stage) return null;
  const fingerprint = reviewFingerprint(workflowPath, stage);
  if (!fingerprint) return `cannot compute ${stage} review fingerprint; finish prior artifacts first`;
  const approval = state.reviews?.[stage]?.approval;
  if (!approval || approval.decision !== "approve" || approval.fingerprint !== fingerprint) {
    return `independent ${stage} review is missing or stale; dispatch a read-only subagent with ${REVIEW_STAGES[stage].request}`;
  }
  if (stage === "cross-check") {
    const challengeAgent = state.reviews?.challenge?.approval?.agentId;
    if (challengeAgent && challengeAgent === approval.agentId) {
      return "cross-check approval must come from a different reviewer than the challenge approval";
    }
  }
  return null;
}

export function clearReviewsFrom(state, stageName) {
  if (!state.reviews) state.reviews = emptyReviews();
  if (stageName === "frame" || stageName === "analysis") {
    state.reviews = emptyReviews();
    return;
  }
  if (stageName === "challenge") {
    state.reviews.challenge = { reservation: null, approval: null };
    state.reviews["cross-check"] = { reservation: null, approval: null };
  }
}
