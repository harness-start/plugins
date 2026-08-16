import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAcknowledgement,
  createLedger,
  parseAcknowledgement,
  renderWorkReport,
  validateAcknowledgement,
  validateWorkReportContract,
  type WorkReportContractV2,
} from "../src/lib/report-contract.js";
import type { EvidenceBundleV2 } from "../src/lib/work-evidence.js";

const evidence: EvidenceBundleV2 = {
  schema: "EvidenceBundleV2",
  window: { label: "2026-W33", start: "2026-08-10T00:00:00.000Z", end: "2026-08-16T23:59:59.999Z" },
  sources: { transcript: { status: "collected", sessions: 1 }, git: { status: "collected", repositories: 1 }, remote: { status: "skipped", items: 0 } },
  records: [{ id: "E-123", type: "git-commit", timestamp: "2026-08-10T10:00:00Z", locator: "repo@abc", digest: "a".repeat(64), ownership: "attributed", verification: "fact", summary: "finish feature" }],
  dataGaps: ["remote skipped"],
};

function contract(): WorkReportContractV2 {
  return {
    schema: "WorkReportContractV2",
    period: { kind: "weekly", label: "2026-W33", start: evidence.window.start, end: evidence.window.end },
    workItems: [{ id: "W1", action: "实现发布保护", result: "减少错误发布", impact: "交付可复核", status: "done", evidenceIds: ["E-123"] }],
    improvementFindings: [{ id: "G1", observableBehavior: "验收记录晚于实现提交", impact: "复核等待时间增加", basis: "fact", evidenceIds: ["E-123"] }],
    priorCommitments: [],
    commitments: [{ id: "A1", findingIds: ["G1"], action: "实现完成后立即记录验收", due: "2026-08-23", successSignal: "连续三次同日记录", verificationMethod: "TL 检查提交与验收时间" }],
    employeeDispositions: [{ findingId: "G1", status: "accepted", commitmentIds: ["A1"] }],
    tlVerification: [{ subjectId: "A1", method: "检查提交与验收时间", owner: "TL", due: "2026-08-24", status: "pending" }],
    advisorRuns: [{ skill: "growth-log", stage: "improvement-analysis", inputDigest: "b".repeat(64), outputDigest: "c".repeat(64), decision: "accepted" }],
    dataGaps: ["remote skipped"],
  };
}

test("WorkReportContractV2 validates evidence links and renders one deterministic dual-audience report", () => {
  const value = contract();
  assert.equal(validateWorkReportContract(value, evidence).ok, true);
  const first = renderWorkReport(value, evidence);
  const second = renderWorkReport(structuredClone(value), structuredClone(evidence));
  assert.equal(first, second);
  for (const heading of ["Work details", "Outcomes and impact", "Improvement observations", "Employee acknowledgement", "TL verification matrix", "Evidence index and data gaps", "Advisor provenance"]) {
    assert.match(first, new RegExp(heading, "u"));
  }
  assert.doesNotMatch(first, /performance score|绩效分/iu);
});

test("contract rejects unknown evidence, personality labels, accepted findings without action, and unresolved disputes", () => {
  const unknown = contract();
  unknown.workItems[0]!.evidenceIds = ["E-missing"];
  assert.match(validateWorkReportContract(unknown, evidence).errors.join(" "), /unknown evidence/u);

  const personality = contract();
  personality.improvementFindings[0]!.observableBehavior = "员工态度差而且懒惰";
  assert.match(validateWorkReportContract(personality, evidence).errors.join(" "), /personality/u);

  const noAction = contract();
  noAction.employeeDispositions[0]!.commitmentIds = [];
  assert.match(validateWorkReportContract(noAction, evidence).errors.join(" "), /accepted.*commitment/iu);

  const disputed = contract();
  disputed.employeeDispositions[0] = { findingId: "G1", status: "disputed", reason: "时间线不完整", commitmentIds: [] };
  disputed.tlVerification = [];
  assert.match(validateWorkReportContract(disputed, evidence).errors.join(" "), /disputed.*TL/iu);
});

test("weekly and summary reports require one to three commitments and completed carry-over needs evidence", () => {
  const value = contract();
  value.commitments = [];
  assert.match(validateWorkReportContract(value, evidence).errors.join(" "), /1.*3.*commitment/iu);
  value.commitments = contract().commitments;
  value.priorCommitments = [{ id: "P1", action: "旧行动", due: "2026-08-09", status: "done", evidenceIds: [] }];
  assert.match(validateWorkReportContract(value, evidence).errors.join(" "), /completed prior commitment.*evidence/iu);
});

test("acknowledgement token binds contract and evidence digests and exact dispositions", () => {
  const value = contract();
  const prepared = createAcknowledgement(value, evidence, "fixed-nonce");
  const reply = parseAcknowledgement(`# work-report-ack ${prepared.token} | G1=accepted | commit=A1`);
  assert.equal(validateAcknowledgement(reply, prepared, value).ok, true);
  const changed = contract();
  changed.workItems[0]!.result = "changed";
  assert.equal(validateAcknowledgement(reply, prepared, changed).ok, false);
  assert.throws(() => parseAcknowledgement(`同意 ${prepared.token}`), /exact acknowledgement/u);
});

test("machine ledger binds the rendered Markdown and carries commitments without becoming a second report", () => {
  const value = contract();
  const markdown = renderWorkReport(value, evidence);
  const ledger = createLedger(value, evidence, markdown);
  assert.equal(ledger.schema, "WorkReportLedgerV2");
  assert.equal(ledger.commitments.length, 1);
  assert.match(ledger.reportDigest, /^[a-f0-9]{64}$/u);
  assert.equal(Object.hasOwn(ledger, "markdown"), false);
});
