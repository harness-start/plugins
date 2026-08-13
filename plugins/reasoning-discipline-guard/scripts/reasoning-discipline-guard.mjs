#!/usr/bin/env node

import {
  contextOutput,
  extractAgentId,
  extractAgentPrompt,
  extractAssistantMessage,
  extractCwd,
  extractFileTargets,
  extractSessionId,
  extractToolName,
  extractToolUseId,
  preToolDeny,
  readStdinJson,
  stopDeny,
  writeJson,
} from "./lib/hook-io.mjs";
import { parseReviewRequest, parseReviewResult, REVIEW_STAGES } from "./lib/independent-review.mjs";
import {
  bindIndependentReviewer,
  discoverWorkflows,
  independentReviewerBinding,
  observeIndependentReview,
  pendingReviewReservation,
  processArtifactMutation,
  reserveIndependentReview,
  stopDecision,
} from "./lib/workflow.mjs";

const SESSION_CONTEXT = "Standing rule: proof, exact, worst-case, algorithmic, causal, and constrained-decision answers must invoke `$reasoning-discipline`; finish five stages before replying, even for final-only formats.";

function feedback(result) {
  if (!result || result.kind === "idle") return null;
  if (result.kind === "bound") {
    return `[Reasoning Discipline Guard] Bound ${result.manifest.id}; write 01-frame.md next.`;
  }
  if (result.kind === "signed") {
    const nextReview = REVIEW_STAGES[result.nextStage];
    const reviewHint = nextReview
      ? ` Dispatch a read-only subagent with only ${nextReview.request} before writing the next stage.`
      : "";
    return `[Reasoning Discipline Guard] Accepted ${result.receipt.stage} as ${result.receipt.id}; next: ${result.nextStage}.${reviewHint}`;
  }
  if (result.kind === "review-required") {
    return `[Reasoning Discipline Guard] ${result.findings.join("; ")}`;
  }
  if (result.kind === "closed") {
    return "[Reasoning Discipline Guard] Workflow closed with RD-R5.";
  }
  if (result.kind === "refreshed") {
    return `[Reasoning Discipline Guard] Workflow status refreshed to ${result.manifest.status}.`;
  }
  const findings = result.findings ?? ["artifact mutation could not be validated"];
  return `[Reasoning Discipline Guard] ${result.kind}: ${findings.join("; ")}`;
}

async function main() {
  const mode = process.argv[2] ?? "";
  const event = await readStdinJson();
  const cwd = extractCwd(event);
  const sessionId = extractSessionId(event);

  if (mode === "session") {
    const workflows = discoverWorkflows(cwd);
    const discovery = workflows.length > 0
      ? `\nDiscovered ${workflows.length} reasoning workflow(s); none was auto-bound. Resume one only when the current request explicitly matches it; otherwise leave it untouched.`
      : "";
    writeJson(contextOutput("SessionStart", `${SESSION_CONTEXT}${discovery}`));
    return;
  }

  if (mode === "pre") {
    const agentId = extractAgentId(event);
    if (agentId) {
      const bound = independentReviewerBinding({ cwd, sessionId, agentId });
      if (bound.kind === "reviewer" && !/^(?:Read|Grep)$/u.test(extractToolName(event))) {
        writeJson(preToolDeny("[Reasoning Discipline Guard] this is a bounded local review: only Read/Grep on declared prior-stage artifacts are allowed."));
      }
      return;
    }
    const request = parseReviewRequest(extractAgentPrompt(event));
    if (!request) return;
    const reserved = reserveIndependentReview({
      cwd,
      sessionId,
      stage: request.stage,
      toolUseId: extractToolUseId(event),
    });
    if (reserved.kind === "rejected") {
      writeJson(preToolDeny(`[Reasoning Discipline Guard] independent review dispatch rejected: ${reserved.reason}`));
    }
    return;
  }

  if (mode === "review-start") {
    let request = parseReviewRequest(extractAgentPrompt(event));
    const pending = pendingReviewReservation({ cwd, sessionId });
    if (!request && pending) request = { stage: pending.stage };
    if (!request) return;
    const bound = bindIndependentReviewer({
      cwd,
      sessionId,
      stage: request.stage,
      agentId: extractAgentId(event),
    });
    if (bound.kind !== "bound-reviewer") {
      writeJson(contextOutput("SubagentStart", `[Reasoning Discipline Guard] ${bound.reason ?? "review reservation is unavailable"}. Return without reviewing.`));
      return;
    }
    const anchors = bound.evidencePaths ?? [];
    writeJson(contextOutput("SubagentStart", [
      "[Reasoning Discipline Independent Reviewer] Derive attacks or an independent check yourself; do not trust the parent analysis, planned challenge, or prior conclusions.",
      `stage=${bound.reservation.stage} reviewNonce=${bound.reservation.nonce}`,
      `evidencePaths=${JSON.stringify(anchors)}`,
      "FIRST ACTION: Read every exact evidencePaths entry. Do not write files, run shell, research, or dispatch nested agents.",
      "Return exactly one final line:",
      `RD_REVIEW_RESULT {"stage":"${bound.reservation.stage}","reviewNonce":"${bound.reservation.nonce}","decision":"approve|challenge","evidenceAnchors":${JSON.stringify(anchors)}}`,
    ].join("\n")));
    return;
  }

  if (mode === "subagent-stop") {
    const parsed = parseReviewResult(extractAssistantMessage(event));
    const reservation = pendingReviewReservation({ cwd, sessionId });
    if (!parsed) {
      if (reservation && (!reservation.agentId || reservation.agentId === extractAgentId(event))) {
        writeJson(stopDeny(`[Reasoning Discipline Guard] Finish the independent review with exactly one final line:\nRD_REVIEW_RESULT {"stage":"${reservation.stage}","reviewNonce":"${reservation.nonce}","decision":"approve|challenge","evidenceAnchors":[]}`));
      }
      return;
    }
    const observed = observeIndependentReview({
      cwd,
      sessionId,
      agentId: extractAgentId(event),
      result: parsed,
    });
    if (observed.kind === "rejected") {
      writeJson(stopDeny(`[Reasoning Discipline Guard] independent review result rejected: ${observed.reason}`));
      return;
    }
    if (observed.kind === "review-recorded") {
      const disposition = observed.receipt.decision === "approve" ? "approval recorded" : "challenge recorded; revise the prior stage before retrying";
      writeJson(contextOutput("SubagentStop", `[Reasoning Discipline Guard] ${observed.receipt.stage} review ${observed.receipt.id}: ${disposition}.`));
    }
    return;
  }

  if (mode === "failure") {
    const paths = extractFileTargets(event);
    if (paths.some((path) => path.includes(".reasoning-discipline"))) {
      writeJson(contextOutput(
        "PostToolUseFailure",
        "[Reasoning Discipline Guard] Artifact write failed; workflow activation and receipts were not advanced.",
      ));
    }
    return;
  }

  if (mode === "post") {
    const result = processArtifactMutation({
      cwd,
      sessionId,
      paths: extractFileTargets(event),
    });
    const message = feedback(result);
    if (message) writeJson(contextOutput("PostToolUse", message));
    return;
  }

  if (mode === "stop") {
    const decision = stopDecision({
      cwd,
      sessionId,
      assistantMessage: extractAssistantMessage(event),
    });
    if (decision.kind === "block") {
      writeJson(stopDeny([
        "[Reasoning Discipline Guard] The active reasoning workflow cannot end yet.",
        ...decision.findings.map((finding) => `- ${finding}`),
        "Complete the ordered artifacts, or set workflow.status to paused/aborted with an honest recovery record.",
      ].join("\n")));
    }
  }
}

main().catch((error) => {
  process.stderr.write(`[reasoning-discipline-guard] ${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
