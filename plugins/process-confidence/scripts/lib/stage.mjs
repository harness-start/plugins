/**
 * Stage anchors and advancement for deliver flow.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stagesDir } from "./paths.mjs";
import { listReceipts } from "./scan.mjs";
import { isValidReceipt } from "./receipt.mjs";

export const STAGE_ORDER = [
  "intent",
  "plan",
  "implement",
  "verify",
  "done",
];

export const INTENT_ANCHORS = ["## 非目标", "## 成功标准"];
export const PLAN_ANCHORS = ["## 涉及文件", "## 验证", "## 回滚"];

export function stageIndex(stage) {
  return STAGE_ORDER.indexOf(stage);
}

export function readStageFile(workspaceRoot, runId, relativeName) {
  const path = join(stagesDir(workspaceRoot, runId), relativeName);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

export function hasAnchors(text, anchors) {
  if (!text) return false;
  return anchors.every((a) => text.includes(a));
}

export function intentReady(workspaceRoot, runId) {
  const text = readStageFile(workspaceRoot, runId, "01-intent.md");
  return hasAnchors(text, INTENT_ANCHORS);
}

export function planReady(workspaceRoot, runId) {
  const text = readStageFile(workspaceRoot, runId, "02-plan.md");
  return hasAnchors(text, PLAN_ANCHORS);
}

export function hasValidVerifyReceipt(workspaceRoot, run, minSeverity = "pass") {
  const receipts = listReceipts(workspaceRoot, run.runId);
  return receipts.some((r) => isValidReceipt(r, run, minSeverity));
}

/**
 * Compute blockers for an open deliver run.
 */
export function computeBlockers(workspaceRoot, run, minSeverity = "pass") {
  if (!run || run.status !== "open") return [];
  const blockers = [];
  if (!intentReady(workspaceRoot, run.runId)) {
    blockers.push("missing-intent-anchors");
  }
  if (!planReady(workspaceRoot, run.runId)) {
    blockers.push("missing-plan-anchors");
  }
  if (!hasValidVerifyReceipt(workspaceRoot, run, minSeverity)) {
    blockers.push("missing-receipt");
  }
  return blockers;
}

/**
 * Infer next stage from disk artifacts (does not write).
 */
export function inferStage(workspaceRoot, run, minSeverity = "pass") {
  if (run.status === "done") return "done";
  if (run.status === "abandoned") return run.stage || "intent";

  if (!intentReady(workspaceRoot, run.runId)) return "intent";
  if (!planReady(workspaceRoot, run.runId)) return "plan";
  if (!hasValidVerifyReceipt(workspaceRoot, run, minSeverity)) {
    // implement until first receipt
    return "implement";
  }
  // receipts exist — verify until complete moves to done
  return "verify";
}

/**
 * Advance run.stage if artifacts allow (returns updated run object, not written).
 */
export function maybeAdvanceStage(workspaceRoot, run, minSeverity = "pass") {
  const next = inferStage(workspaceRoot, run, minSeverity);
  if (next === run.stage) return { changed: false, run };
  const orderOk = stageIndex(next) >= stageIndex(run.stage);
  // Allow forward only (or recompute if stuck lower due to missing files)
  if (!orderOk && stageIndex(next) < stageIndex(run.stage)) {
    // allow going back if anchors removed
    return {
      changed: true,
      run: { ...run, stage: next, updatedAt: new Date().toISOString() },
    };
  }
  if (stageIndex(next) > stageIndex(run.stage)) {
    return {
      changed: true,
      run: { ...run, stage: next, updatedAt: new Date().toISOString() },
    };
  }
  return { changed: false, run };
}
