import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { commandHash } from "../scripts/lib/command-policy.mjs";
import { resolveConfig } from "../scripts/lib/config.mjs";
import { validateManifestEvidence } from "../scripts/lib/evidence.mjs";
import { parseEvidenceManifest } from "../scripts/lib/manifest.mjs";
import { updateState } from "../scripts/lib/state-store.mjs";
import { evaluateStop } from "../scripts/verification-provenance-guard.mjs";

function pairwise(dimensions, exclusions = [], maxCases = 128) {
  const candidates = [];
  function visit(index, current) {
    if (index === dimensions.length) {
      const excluded = exclusions.some(({ when }) => Object.entries(when).every(([key, value]) => current[key] === value));
      if (!excluded) candidates.push({ ...current });
      return;
    }
    for (const value of dimensions[index].values) visit(index + 1, { ...current, [dimensions[index].name]: value });
  }
  visit(0, {});
  const key = (a, av, b, bv) => JSON.stringify([a, av, b, bv]);
  const uncovered = new Set();
  for (const candidate of candidates) for (let left = 0; left < dimensions.length; left += 1) for (let right = left + 1; right < dimensions.length; right += 1) {
    uncovered.add(key(dimensions[left].name, candidate[dimensions[left].name], dimensions[right].name, candidate[dimensions[right].name]));
  }
  const totalPairs = uncovered.size;
  const cases = [];
  while (uncovered.size > 0 && cases.length < maxCases) {
    let best = null;
    let bestKeys = [];
    for (const candidate of candidates) {
      const keys = [];
      for (let left = 0; left < dimensions.length; left += 1) for (let right = left + 1; right < dimensions.length; right += 1) {
        const pair = key(dimensions[left].name, candidate[dimensions[left].name], dimensions[right].name, candidate[dimensions[right].name]);
        if (uncovered.has(pair)) keys.push(pair);
      }
      if (keys.length > bestKeys.length) { best = candidate; bestKeys = keys; }
    }
    if (!best) break;
    cases.push(best);
    for (const pair of bestKeys) uncovered.delete(pair);
  }
  return { cases, totalPairs, uncovered: uncovered.size };
}

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "verification-matrix-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  writeFileSync(join(root, "artifact.txt"), "ok\n");
  return root;
}

function validUnverifiedResponse(completion) {
  return [
    "- [C1][unverified] Automatic verification has not run.",
    "",
    "```verification-evidence",
    JSON.stringify({
      schema: "verification-evidence/v1",
      completion,
      claims: [{ id: "C1", predicate: "other", status: "unverified", statement: "Automatic verification has not run.", reason: "Matrix case." }],
      evidence: [],
    }),
    "```",
  ].join("\n");
}

test("parser and trigger pairwise matrix stays fully covered", async (context) => {
  const dimensions = [
    { name: "trigger", values: ["no_work", "mutation", "validation_claim", "artifact_claim"] },
    { name: "completion", values: ["noncompletion", "completion"] },
    { name: "manifest", values: ["absent", "valid", "malformed_json", "duplicate_block", "oversized"] },
    { name: "outside_text", values: ["none", "labeled_claim", "bare_pass_claim", "bare_artifact_claim", "negated_or_quoted"] },
    { name: "stop_active", values: [false, true] },
  ];
  const matrix = pairwise(dimensions, [], 40);
  assert.deepEqual({ cases: matrix.cases.length, pairs: matrix.totalPairs, uncovered: matrix.uncovered }, { cases: 27, pairs: 125, uncovered: 0 });
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "verification-matrix-state-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  process.env.PLUGIN_DATA = data;
  const config = resolveConfig(null);

  for (const [index, item] of matrix.cases.entries()) {
    const event = { cwd: root, session_id: `parser-${index}`, stop_hook_active: item.stop_active };
    if (item.trigger === "mutation") updateState(event, (state) => { state.mutations = 1; state.revision = 1; });
    let message = item.manifest === "absent" ? "Ordinary explanation." : validUnverifiedResponse(item.completion === "completion" ? "done_with_concerns" : "needs_context");
    if (item.manifest === "malformed_json") message = "```verification-evidence\n{\"schema\":\n```";
    if (item.manifest === "duplicate_block") message = `${validUnverifiedResponse("needs_context")}\n${validUnverifiedResponse("needs_context")}`;
    if (item.manifest === "oversized") message = `\`\`\`verification-evidence\n${"x".repeat(33 * 1024)}\n\`\`\``;
    if (item.trigger === "validation_claim") message += "\nAll unit tests passed.";
    if (item.trigger === "artifact_claim") message += "\nReport generated: `artifact.txt`.";
    if (item.outside_text === "labeled_claim") message += "\n- [C2][locally-verified] All unit tests passed.";
    if (item.outside_text === "bare_pass_claim") message += "\nAll unit tests passed.";
    if (item.outside_text === "bare_artifact_claim") message += "\nReport generated: `artifact.txt`.";
    if (item.outside_text === "negated_or_quoted") message += "\nTests have not passed.\n> Example: all tests passed.";
    event.last_assistant_message = message;
    const decision = await evaluateStop(event, config, root);
    const safeOutside = ["none", "negated_or_quoted"].includes(item.outside_text);
    const triggerAddsBare = ["validation_claim", "artifact_claim"].includes(item.trigger);
    const expectedAllow = item.manifest === "valid"
      ? safeOutside && !triggerAddsBare
      : item.manifest === "absent" && item.trigger === "no_work" && safeOutside;
    assert.equal(decision.allow, expectedAllow, `parser matrix case ${index + 1}: ${JSON.stringify(item)}`);
  }
});

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function evidenceItem(kind, stateName) {
  if (kind === "command") return { id: "E1", kind, command: "node --test", exitCode: 0, summary: { passed: 1, failed: 0 } };
  if (kind === "artifact") return { id: "E1", kind, path: stateName === "missing" ? "missing.txt" : "artifact.txt", format: "text", bytes: 3, sha256: stateName === "mismatch" ? "0".repeat(64) : digest("ok\n") };
  if (kind === "ci") return { id: "E1", kind, provider: "gitlab", pipelineId: "1", status: "success", sha: "a".repeat(40), url: "https://git.example/pipelines/1", query: "glab api projects/1/pipelines/1" };
  return null;
}

test("evidence status, kind, freshness, revision, and representation pairwise matrix stays fully covered", async (context) => {
  const dimensions = [
    { name: "claim_status", values: ["verified", "inferred", "unverified"] },
    { name: "evidence_kind", values: ["command", "artifact", "ci", "none"] },
    { name: "evidence_state", values: ["current_success", "current_failure", "stale_success", "missing", "mismatch", "unreliable_shell"] },
    { name: "revision", values: ["before_last_mutation", "after_last_mutation", "no_mutation"] },
    { name: "representation", values: ["canonical", "duplicate_id", "unknown_field", "unicode_confusable"] },
  ];
  const exclusions = [
    ...["current_success", "current_failure", "stale_success", "mismatch", "unreliable_shell"].map((evidence_state) => ({ when: { evidence_kind: "none", evidence_state } })),
    ...["current_failure", "stale_success", "unreliable_shell"].map((evidence_state) => ({ when: { evidence_kind: "artifact", evidence_state } })),
    { when: { evidence_kind: "ci", evidence_state: "unreliable_shell" } },
  ];
  const matrix = pairwise(dimensions, exclusions, 48);
  assert.deepEqual({ cases: matrix.cases.length, pairs: matrix.totalPairs, uncovered: matrix.uncovered }, { cases: 28, pairs: 148, uncovered: 0 });
  const root = workspace();
  context.after(() => rmSync(root, { recursive: true, force: true }));

  for (const [index, item] of matrix.cases.entries()) {
    const evidence = evidenceItem(item.evidence_kind, item.evidence_state);
    const predicate = item.evidence_kind === "command" ? "test_suite_passed"
      : item.evidence_kind === "artifact" ? "artifact_materialized"
        : item.evidence_kind === "ci" ? "ci_pipeline_succeeded" : "other";
    const claim = item.claim_status === "verified"
      ? { id: "C1", predicate, status: "verified", statement: "Verified conclusion.", evidence: evidence ? ["E1"] : [] }
      : item.claim_status === "inferred"
        ? { id: "C1", predicate, status: "inferred", statement: "Inferred conclusion.", basis: "Matrix basis.", ...(evidence ? { evidence: ["E1"] } : {}) }
        : { id: "C1", predicate: "other", status: "unverified", statement: "Unverified conclusion.", reason: "Matrix reason." };
    const raw = {
      schema: "verification-evidence/v1",
      completion: item.claim_status === "verified" ? "done" : "done_with_concerns",
      claims: item.representation === "duplicate_id" ? [claim, claim] : [claim],
      evidence: item.claim_status === "unverified" || !evidence ? [] : [evidence],
      ...(item.representation === "unknown_field" ? { surprise: true } : {}),
    };
    if (item.representation === "unicode_confusable") raw.claims[0] = { ...raw.claims[0], id: "Ｃ1" };
    let parsed;
    try { parsed = parseEvidenceManifest(JSON.stringify(raw)); } catch {
      assert.notEqual(item.representation, "canonical", `canonical schema case ${index + 1} should parse`);
      continue;
    }
    assert.equal(item.representation, "canonical", `noncanonical schema case ${index + 1} should reject`);
    if (item.claim_status !== "verified") {
      assert.deepEqual(await validateManifestEvidence(parsed, { state: {}, workspaceRoot: root, maxArtifactBytes: 1024 }), []);
      continue;
    }
    const revision = item.revision === "no_mutation" ? 0 : 1;
    const receiptRevision = item.revision === "before_last_mutation" || item.evidence_state === "stale_success" ? revision - 1 : revision;
    const outcome = item.evidence_state === "current_failure" ? "failure" : "success";
    const reliable = item.evidence_state !== "unreliable_shell";
    const receipts = [];
    if (!["missing"].includes(item.evidence_state) && evidence?.kind === "command") receipts.push({ commandHash: commandHash(evidence.command), class: "test", outcome, reliable, revision: receiptRevision, summary: item.evidence_state === "mismatch" ? { passed: 2, failed: 0 } : { passed: 1, failed: 0 } });
    if (!["missing"].includes(item.evidence_state) && evidence?.kind === "ci") receipts.push({ commandHash: commandHash(evidence.query), class: "ci", outcome, reliable: true, revision: receiptRevision, ci: item.evidence_state === "mismatch" ? { provider: "gitlab", pipelineId: "2", status: "success", sha: "b".repeat(40), url: evidence.url } : { provider: evidence.provider, pipelineId: evidence.pipelineId, status: evidence.status, sha: evidence.sha, url: evidence.url } });
    const findings = await validateManifestEvidence(parsed, { state: { revision, receipts }, workspaceRoot: root, maxArtifactBytes: 1024 });
    const expectedValid = item.evidence_state === "current_success" && item.revision !== "before_last_mutation";
    const artifactValid = item.evidence_kind === "artifact" && item.evidence_state === "current_success";
    assert.equal(findings.length === 0, expectedValid || artifactValid, `evidence matrix case ${index + 1}: ${JSON.stringify(item)}`);
  }
});
