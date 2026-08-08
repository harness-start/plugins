#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { detectUnsupportedClaims } from "./lib/claims.mjs";
import {
  classifyCommand,
  commandHash,
  commandReliability,
  inferOutcome,
  parseCiResult,
  parseVerificationSummary,
  responseText,
} from "./lib/command-policy.mjs";
import { loadConfig } from "./lib/config.mjs";
import { validateManifestEvidence } from "./lib/evidence.mjs";
import {
  extractEvidenceBlock,
  parseEvidenceManifest,
  removeEvidenceAndClaimLines,
  validateVisibleClaims,
} from "./lib/manifest.mjs";
import {
  additionalContextOutput,
  extractAssistantMessage,
  extractCwd,
  extractPrompt,
  extractShellCommand,
  extractToolResponse,
  isFileMutation,
  readStdinJson,
  stopBlock,
  writeJson,
} from "./lib/hook-io.mjs";
import { mutationScopes, shellMutationScopes } from "./lib/mutation-policy.mjs";
import { clearState, readState, updateState } from "./lib/state-store.mjs";
import { validateWorkflowEvidence } from "./lib/workflow.mjs";

const SESSION_CONTEXT = [
  "[Verification Provenance Guard] Delivery evidence protocol is enabled.",
  "For substantial work, use the bundled `evidence-driven-delivery` Skill: contract, challenge, minimal change, targeted verification, complete verification, adversarial review, then report.",
  "After file or workspace changes, use a verification-evidence/v2 manifest. Behavior code requires test edit -> observed RED -> production edit -> current GREEN; refactors require the same GREEN command before and after the edit.",
  "Use `verification-evidence-reporting` for the exact template. Final command evidence must be after the latest mutation and in the current user-prompt epoch; labels and subagent reports are not evidence.",
].join("\n");

function warn(message) {
  process.stderr.write(`[verification-provenance-guard] ${message}\n`);
}

function nextSeq(state) {
  state.eventSeq += 1;
  return state.eventSeq;
}

function recordMutation(state, scopes = ["unknown"]) {
  state.revision += 1;
  const seq = nextSeq(state);
  for (const scope of scopes) {
    state.mutations.push({ seq, promptEpoch: state.promptEpoch, revision: state.revision, scope });
  }
}

function configuredFailureMatch(response, patterns) {
  const text = responseText(response);
  return (patterns ?? []).some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function runPrompt(event) {
  updateState(event, (state) => {
    state.promptEpoch += 1;
    state.stopBlocks = 0;
    state.abortAuthorized = extractPrompt(event).trim() === "# verification-abort";
  });
}

function runPost(event, config, forceFailure) {
  updateState(event, (state) => {
    if (isFileMutation(event)) {
      const scopes = mutationScopes(event, config.paths);
      recordMutation(state, scopes);
      if (scopes.some((scope) => ["code", "unknown"].includes(scope))) {
        const hasChallenge = state.receipts.some((receipt) => receipt.class === "test" && receipt.reliable === true && ["success", "failure"].includes(receipt.outcome));
        if (!hasChallenge) warn("code or unknown mutation observed before a test RED/GREEN challenge; completion will be blocked");
      }
      return;
    }
    const command = extractShellCommand(event);
    if (!command?.trim()) return;
    const classification = classifyCommand(command, config.commands);
    const reliability = commandReliability(command);
    if (classification === "mutation" || reliability.workspaceMutation) {
      recordMutation(state, shellMutationScopes(command, extractCwd(event), config.paths));
    }
    if (!["test", "verification", "ci"].includes(classification)) return;
    const response = extractToolResponse(event);
    const outcome = inferOutcome(response, forceFailure);
    const summary = ["test", "verification"].includes(classification) ? parseVerificationSummary(response) : null;
    const provider = /\bgh\s+/iu.test(command) ? "github" : "gitlab";
    state.receipts.push({
      seq: nextSeq(state),
      commandHash: commandHash(command),
      class: classification,
      outcome,
      reliable: reliability.reliable,
      redQualified: outcome === "failure" && ((summary?.failed ?? 0) > 0 || configuredFailureMatch(response, config.commands.expectedFailurePatterns)),
      promptEpoch: state.promptEpoch,
      revision: state.revision,
      summary,
      ci: classification === "ci" && outcome === "success" ? parseCiResult(response, provider) : null,
      at: Date.now(),
    });
  });
}

function triggerRequired(config, state, unsupported, blockPresent) {
  if (config.trigger === "always") return true;
  if (blockPresent || unsupported.length > 0) return true;
  return config.trigger === "mutation-or-claim" && state.mutations.length > 0;
}

function formatBlock(findings, compact = false) {
  if (compact) {
    return [
      "[Verification Provenance Guard] Completion remains blocked after repeated invalid evidence.",
      ...findings.slice(0, 6).map((finding) => `- ${finding}`),
      "Return a valid verification-evidence/v2 report with completion blocked/needs_context, or ask the user to submit exactly `# verification-abort`.",
    ].join("\n");
  }
  return [
    "[Verification Provenance Guard] Completion evidence is incomplete or cannot be verified automatically.",
    "",
    ...findings.slice(0, 12).map((finding) => `- ${finding}`),
    "",
    "Recovery: use the `evidence-driven-delivery` and `verification-evidence-reporting` Skills, give every visible conclusion a C# identifier, and provide exactly one verification-evidence/v2 JSON block.",
    "A final command receipt must be after the latest change and in the current user-prompt epoch. Historical RED/baseline receipts remain process evidence only.",
    "When automatic proof is unavailable, use [inferred] or [unverified] and provide basis/reason; do not merely add a [locally-verified] label.",
  ].join("\n");
}

export async function evaluateStop(event, config, repoRoot) {
  const message = extractAssistantMessage(event);
  const state = readState(event);
  if (state.abortAuthorized) return { allow: true, terminal: true, aborted: true, state };
  let block;
  const findings = [];
  try {
    block = extractEvidenceBlock(message, config.manifest);
  } catch (error) {
    findings.push(error.message);
    block = { present: true, raw: null, outside: message };
  }
  let unsupported = [];
  try {
    unsupported = detectUnsupportedClaims(
      block.present && block.raw !== null ? removeEvidenceAndClaimLines(message, config.manifest) : message,
      config.claims.additionalPatterns,
    );
  } catch (error) {
    findings.push(`claim detection failed: ${error.message}`);
  }
  if (!triggerRequired(config, state, unsupported, block.present)) return { allow: true, terminal: false, state };
  if (!block.present || block.raw === null) findings.push("missing a unique verification-evidence block");
  let manifest = null;
  if (block.raw !== null) {
    try {
      manifest = parseEvidenceManifest(block.raw, config.manifest);
      validateVisibleClaims(message, manifest, config.manifest);
    } catch (error) {
      findings.push(error.message);
    }
  }
  if (unsupported.length > 0) findings.push(`unsupported bare conclusion categories: ${unsupported.join(", ")}`);
  if (manifest) findings.push(...await validateManifestEvidence(manifest, { state, workspaceRoot: repoRoot, maxArtifactBytes: config.artifact.maxBytes }));
  if (manifest?.schema === "verification-evidence/v1" && state.mutations.length > 0) {
    findings.push("completion after mutations requires verification-evidence/v2");
  }
  if (manifest?.schema === "verification-evidence/v2") {
    findings.push(...await validateWorkflowEvidence(manifest, { state, workspaceRoot: repoRoot, maxArtifactBytes: config.artifact.maxBytes }));
  }
  if (findings.length > 0) return { allow: false, findings: [...new Set(findings)], state, manifest };
  return { allow: true, terminal: ["done", "done_with_concerns"].includes(manifest.completion), state, manifest };
}

async function runStop(event, config, repoRoot) {
  if (config.mode === "off") return;
  const decision = await evaluateStop(event, config, repoRoot);
  if (decision.allow) {
    if (decision.terminal) clearState(event);
    else updateState(event, (state) => { state.stopBlocks = 0; });
    return;
  }
  const updated = updateState(event, (state) => { state.stopBlocks += 1; return state.stopBlocks; });
  const attempts = updated.result ?? decision.state.stopBlocks + 1;
  const reason = formatBlock(decision.findings, attempts > config.stop.maxBlocks);
  if (config.mode === "report") {
    warn(`${reason}\n[report-only] Completion was not blocked.`);
    return;
  }
  writeJson(stopBlock(reason));
  process.stderr.write(`${reason}\n`);
}

export async function main(mode = process.argv[2]) {
  const event = await readStdinJson();
  if (event.__parseError || !["session", "prompt", "post", "failure", "stop"].includes(mode)) return;
  const cwd = resolve(extractCwd(event));
  const { config, repoRoot } = await loadConfig(cwd, warn);
  if (mode === "session") {
    updateState(event, () => {});
    writeJson(additionalContextOutput(SESSION_CONTEXT));
  } else if (mode === "prompt") runPrompt(event);
  else if (mode === "post") runPost(event, config, false);
  else if (mode === "failure") runPost(event, config, true);
  else await runStop(event, config, repoRoot);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    warn(`hook failed open: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(0);
  });
}
