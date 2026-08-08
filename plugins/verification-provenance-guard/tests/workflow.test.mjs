import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { commandHash } from "../scripts/lib/command-policy.mjs";
import { parseEvidenceManifest } from "../scripts/lib/manifest.mjs";
import { validateWorkflowEvidence } from "../scripts/lib/workflow.mjs";

const COMMAND = "node --test tests/app.test.mjs";

function behaviorManifest(overrides = {}) {
  return parseEvidenceManifest(JSON.stringify({
    schema: "verification-evidence/v2",
    completion: "done",
    workflow: {
      profile: "code_behavior",
      contract: "The public module exports the requested behavior.",
      challenge: { kind: "red_test", evidence: ["E1"] },
      targetedVerification: ["E2"],
      completeVerification: ["E2"],
      adversarialReview: {
        status: "verified",
        statement: "The public regression path was rerun.",
        evidence: ["E2"],
      },
    },
    claims: [{ id: "C1", predicate: "test_suite_passed", status: "verified", statement: "Unit tests passed: 1/1.", evidence: ["E2"] }],
    evidence: [
      { id: "E1", kind: "command", command: COMMAND, outcome: "expected_failure", summary: { passed: 0, failed: 1 } },
      { id: "E2", kind: "command", command: COMMAND, outcome: "success", summary: { passed: 1, failed: 0 } },
    ],
    ...overrides,
  }));
}

function behaviorState() {
  return {
    promptEpoch: 2,
    revision: 2,
    mutations: [
      { seq: 1, promptEpoch: 1, revision: 1, scope: "test" },
      { seq: 3, promptEpoch: 1, revision: 2, scope: "code" },
    ],
    receipts: [
      { seq: 2, promptEpoch: 1, revision: 1, commandHash: commandHash(COMMAND), class: "test", outcome: "failure", reliable: true, redQualified: true, summary: { passed: 0, failed: 1 } },
      { seq: 4, promptEpoch: 2, revision: 2, commandHash: commandHash(COMMAND), class: "test", outcome: "success", reliable: true, summary: { passed: 1, failed: 0 } },
    ],
  };
}

test("code behavior accepts historical RED but requires current-prompt final GREEN", async () => {
  assert.deepEqual(await validateWorkflowEvidence(behaviorManifest(), { state: behaviorState(), workspaceRoot: process.cwd() }), []);
  const stale = behaviorState();
  stale.receipts[1].promptEpoch = 1;
  const findings = await validateWorkflowEvidence(behaviorManifest(), { state: stale, workspaceRoot: process.cwd() });
  assert.ok(findings.some((finding) => /current (?:user-prompt epoch|successful test)/u.test(finding)));
});

test("code behavior rejects RED after production mutation and done_with_concerns cannot bypass it", async () => {
  const state = behaviorState();
  state.mutations[1].seq = 2;
  state.receipts[0].seq = 3;
  const findings = await validateWorkflowEvidence(behaviorManifest({ completion: "done_with_concerns" }), { state, workspaceRoot: process.cwd() });
  assert.ok(findings.some((finding) => /before the first production mutation/u.test(finding)));
});

test("code behavior requires an explicit production-code mutation while unknown changes only affect freshness", async () => {
  const state = behaviorState();
  state.revision = 3;
  state.mutations = [
    { seq: 1, promptEpoch: 1, revision: 1, scope: "unknown" },
    { seq: 2, promptEpoch: 1, revision: 2, scope: "test" },
    { seq: 4, promptEpoch: 1, revision: 3, scope: "code" },
  ];
  state.receipts = [
    { ...state.receipts[0], seq: 3, revision: 2 },
    { ...state.receipts[1], seq: 5, revision: 3 },
  ];
  assert.deepEqual(await validateWorkflowEvidence(behaviorManifest(), { state, workspaceRoot: process.cwd() }), []);

  const noExplicitCode = behaviorState();
  noExplicitCode.mutations[1].scope = "unknown";
  assert.ok((await validateWorkflowEvidence(behaviorManifest(), { state: noExplicitCode, workspaceRoot: process.cwd() }))
    .some((finding) => /production mutation after RED/u.test(finding)));
});

test("code behavior requires a current successful test in complete verification", async () => {
  const raw = behaviorManifest();
  raw.workflow.completeVerification = [];
  const findings = await validateWorkflowEvidence(raw, { state: behaviorState(), workspaceRoot: process.cwd() });
  assert.ok(findings.some((finding) => /current successful test/u.test(finding)));
});

test("code refactor requires the same green command before and after code mutation", async () => {
  const manifest = behaviorManifest({
    workflow: {
      ...behaviorManifest().workflow,
      profile: "code_refactor",
      challenge: { kind: "baseline_green", evidence: ["E1"] },
    },
    evidence: [
      { id: "E1", kind: "command", command: COMMAND, outcome: "success", summary: { passed: 1, failed: 0 } },
      { id: "E2", kind: "command", command: COMMAND, outcome: "success", summary: { passed: 1, failed: 0 } },
    ],
  });
  const state = {
    promptEpoch: 1,
    revision: 1,
    mutations: [{ seq: 2, promptEpoch: 1, revision: 1, scope: "code" }],
    receipts: [
      { seq: 1, promptEpoch: 1, revision: 0, commandHash: commandHash(COMMAND), class: "test", outcome: "success", reliable: true, summary: { passed: 1, failed: 0 } },
      { seq: 3, promptEpoch: 1, revision: 1, commandHash: commandHash(COMMAND), class: "test", outcome: "success", reliable: true, summary: { passed: 1, failed: 0 } },
    ],
  };
  assert.deepEqual(await validateWorkflowEvidence(manifest, { state, workspaceRoot: process.cwd() }), []);
  manifest.evidence[1].command = "node --test tests/other.test.mjs";
  assert.match((await validateWorkflowEvidence(manifest, { state, workspaceRoot: process.cwd() }))[0], /same normalized test command/u);
});

test("blocked and needs_context reports do not pretend incomplete workflow stages passed", async () => {
  const manifest = behaviorManifest({
    completion: "blocked",
    workflow: {
      ...behaviorManifest().workflow,
      challenge: { kind: "not_applicable", basis: "The required test environment is unavailable." },
      targetedVerification: [],
      completeVerification: [],
      adversarialReview: { status: "unverified", statement: "No final review ran.", reason: "The task is blocked." },
    },
    claims: [{ id: "C1", predicate: "other", status: "unverified", statement: "The task is blocked.", reason: "The required test environment is unavailable." }],
    evidence: [],
  });
  assert.deepEqual(await validateWorkflowEvidence(manifest, { state: behaviorState(), workspaceRoot: process.cwd() }), []);
});

test("non-code negative check must precede the mutation and final verification must be current", async (context) => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "verification-non-code-"));
  context.after(() => rmSync(workspaceRoot, { recursive: true, force: true }));
  const command = "node scripts/validate-report.mjs";
  const manifest = parseEvidenceManifest(JSON.stringify({
    schema: "verification-evidence/v2",
    completion: "done",
    workflow: {
      profile: "non_code",
      contract: "The generated report passes its validator.",
      challenge: { kind: "negative_check", evidence: ["E1"] },
      targetedVerification: ["E2"],
      completeVerification: ["E2"],
      adversarialReview: { status: "verified", statement: "The final report was validated.", evidence: ["E2"] },
    },
    claims: [{ id: "C1", predicate: "verification_succeeded", status: "verified", statement: "The report validator passed: 1/1.", evidence: ["E2"] }],
    evidence: [
      { id: "E1", kind: "command", command, outcome: "expected_failure", summary: { passed: 0, failed: 1 } },
      { id: "E2", kind: "command", command, outcome: "success", summary: { passed: 1, failed: 0 } },
    ],
  }));
  const state = {
    promptEpoch: 1,
    revision: 1,
    mutations: [{ seq: 2, promptEpoch: 1, revision: 1, scope: "non_code" }],
    receipts: [
      { seq: 1, promptEpoch: 1, revision: 0, commandHash: commandHash(command), class: "verification", outcome: "failure", reliable: true, redQualified: true, summary: { passed: 0, failed: 1 } },
      { seq: 3, promptEpoch: 1, revision: 1, commandHash: commandHash(command), class: "verification", outcome: "success", reliable: true, summary: { passed: 1, failed: 0 } },
    ],
  };
  assert.deepEqual(await validateWorkflowEvidence(manifest, { state, workspaceRoot }), []);
  state.receipts[0].seq = 4;
  assert.ok((await validateWorkflowEvidence(manifest, { state, workspaceRoot })).some((finding) => /before the first mutation/u.test(finding)));
});
