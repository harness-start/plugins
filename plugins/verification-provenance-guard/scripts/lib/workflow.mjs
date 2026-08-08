import { commandHash } from "./command-policy.mjs";
import { validateEvidence } from "./evidence.mjs";

function summaryMatches(expected, actual) {
  if (!expected) return true;
  if (!actual) return false;
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function receiptFor(item, state, outcome) {
  const hash = commandHash(item.command);
  return [...(state.receipts ?? [])].reverse().find((receipt) =>
    receipt.commandHash === hash
    && receipt.outcome === outcome
    && receipt.reliable === true
    && summaryMatches(item.summary, receipt.summary));
}

function predicateFor(item) {
  if (item.kind === "command") return "verification_succeeded";
  if (item.kind === "artifact") return "artifact_materialized";
  if (item.kind === "git") return "git_state_matches";
  if (item.kind === "ci") return "ci_pipeline_succeeded";
  return "other";
}

async function validateCurrentIds(ids, byId, context) {
  const findings = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) continue;
    if (item.kind === "command" && item.outcome !== "success") {
      findings.push(`${id}: completion-stage command evidence must have outcome success`);
      continue;
    }
    findings.push(...await validateEvidence(item, predicateFor(item), context));
  }
  return findings;
}

function validateRedChallenge(workflow, byId, state, mutations) {
  const findings = [];
  if (workflow.challenge.kind !== "red_test") return ["code_behavior requires a red_test challenge"];
  const evidence = workflow.challenge.evidence.map((id) => byId.get(id));
  const item = evidence.find((candidate) => candidate?.kind === "command" && candidate.outcome === "expected_failure");
  if (!item) return ["code_behavior requires expected_failure command evidence"];
  const receipt = receiptFor(item, state, "failure");
  if (!receipt || receipt.class !== "test" || !(receipt.redQualified === true || receipt.summary?.failed > 0)) {
    return [`${item.id}: RED evidence must match a reliable test failure with at least one parsed failing test`];
  }
  const testMutation = mutations.find((mutation) => mutation.scope === "test" && mutation.seq < receipt.seq);
  if (!testMutation) findings.push("code_behavior requires a test mutation before the RED receipt");
  const production = mutations.find((mutation) => mutation.scope === "code");
  if (!production) findings.push("code_behavior requires a production mutation after RED");
  else if (!(receipt.seq < production.seq)) findings.push("RED must run before the first production mutation");
  const finalGreen = workflow.completeVerification
    .map((id) => byId.get(id))
    .filter((candidate) => candidate?.kind === "command" && candidate.outcome === "success")
    .some((candidate) => {
      const greenReceipt = receiptFor(candidate, state, "success");
      return greenReceipt?.class === "test"
        && greenReceipt.revision === state.revision
        && ((state.promptEpoch ?? 0) === 0 || greenReceipt.promptEpoch === state.promptEpoch);
    });
  if (!finalGreen) findings.push("code_behavior completeVerification requires a current successful test receipt");
  return findings;
}

function validateRefactorChallenge(workflow, byId, state, mutations) {
  if (workflow.challenge.kind !== "baseline_green") return ["code_refactor requires a baseline_green challenge"];
  const baselineItem = workflow.challenge.evidence.map((id) => byId.get(id)).find((item) => item?.kind === "command" && item.outcome === "success");
  if (!baselineItem) return ["code_refactor requires successful command evidence for the baseline"];
  const firstCodeMutation = mutations.find((mutation) => ["code", "test", "unknown"].includes(mutation.scope));
  const baselineHash = commandHash(baselineItem.command);
  const baseline = (state.receipts ?? []).find((receipt) =>
    receipt.commandHash === baselineHash
    && receipt.class === "test"
    && receipt.outcome === "success"
    && receipt.reliable === true
    && summaryMatches(baselineItem.summary, receipt.summary)
    && (!firstCodeMutation || receipt.seq < firstCodeMutation.seq));
  if (!baseline) {
    return [`${baselineItem.id}: baseline GREEN must be a reliable test success before the first code mutation`];
  }
  const completeCommands = workflow.completeVerification
    .map((id) => byId.get(id))
    .filter((item) => item?.kind === "command" && item.outcome === "success");
  if (!completeCommands.some((item) => commandHash(item.command) === commandHash(baselineItem.command))) {
    return ["code_refactor must use the same normalized test command before and after the mutation"];
  }
  return [];
}

function validateNonCodeChallenge(workflow, byId, state, mutations) {
  const { challenge } = workflow;
  const firstMutation = mutations[0];
  if (!["negative_check", "counterexample", "dry_run", "not_applicable"].includes(challenge.kind)) {
    return ["non_code requires a negative_check, counterexample, dry_run, or not_applicable challenge"];
  }
  if (challenge.kind === "negative_check") {
    const item = challenge.evidence.map((id) => byId.get(id)).find((candidate) => candidate?.kind === "command" && candidate.outcome === "expected_failure");
    const receipt = item ? receiptFor(item, state, "failure") : null;
    if (!item || !receipt || !(receipt.redQualified === true || receipt.summary?.failed > 0)) {
      return ["negative_check requires a reliable expected-failure command receipt"];
    }
    if (firstMutation && !(receipt.seq < firstMutation.seq)) return ["negative_check must run before the first mutation"];
  }
  if (challenge.kind === "dry_run") {
    const item = challenge.evidence.map((id) => byId.get(id)).find((candidate) => candidate?.kind === "command" && candidate.outcome === "success");
    const receipt = item ? receiptFor(item, state, "success") : null;
    if (!item || !receipt) return ["dry_run requires a reliable successful command receipt"];
    if (firstMutation && !(receipt.seq < firstMutation.seq)) return ["dry_run must run before the first mutation"];
  }
  return [];
}

export async function validateWorkflowEvidence(manifest, { state = {}, workspaceRoot, maxArtifactBytes = 64 * 1024 * 1024 }) {
  if (manifest.schema !== "verification-evidence/v2") return [];
  if (["blocked", "needs_context"].includes(manifest.completion)) return [];
  const workflow = manifest.workflow;
  const byId = new Map(manifest.evidence.map((item) => [item.id, item]));
  const mutations = Array.isArray(state.mutations) ? state.mutations : [];
  const codeRisk = mutations.some((mutation) => ["code", "test", "unknown"].includes(mutation.scope));
  const findings = [];

  if (codeRisk && workflow.profile === "non_code") findings.push("code or unknown mutations cannot use the non_code profile");
  if (workflow.profile === "code_behavior") findings.push(...validateRedChallenge(workflow, byId, state, mutations));
  else if (workflow.profile === "code_refactor") findings.push(...validateRefactorChallenge(workflow, byId, state, mutations));
  else findings.push(...validateNonCodeChallenge(workflow, byId, state, mutations));

  if (mutations.length > 0 && workflow.targetedVerification.length === 0) findings.push("workflow.targetedVerification requires current evidence after mutations");
  if (mutations.length > 0 && workflow.completeVerification.length === 0) findings.push("workflow.completeVerification requires current evidence after mutations");
  const context = { state, workspaceRoot, maxArtifactBytes };
  findings.push(...await validateCurrentIds(workflow.targetedVerification, byId, context));
  findings.push(...await validateCurrentIds(workflow.completeVerification, byId, context));
  if (workflow.adversarialReview.status === "verified") {
    findings.push(...await validateCurrentIds(workflow.adversarialReview.evidence, byId, context));
  }
  if (manifest.completion === "done" && workflow.adversarialReview.status !== "verified") {
    findings.push("completion done requires a verified adversarialReview");
  }
  if (manifest.completion === "done" && workflow.challenge.kind === "not_applicable") {
    findings.push("not_applicable challenge requires done_with_concerns, blocked, or needs_context");
  }
  return [...new Set(findings)];
}
