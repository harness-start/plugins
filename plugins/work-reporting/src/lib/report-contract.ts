import { createHash, randomBytes } from "node:crypto";

import type { EvidenceBundleV2 } from "./work-evidence.js";

export type WorkItemV2 = {
  id: string;
  action: string;
  result: string;
  impact: string;
  status: "done" | "in-progress" | "blocked" | "planned";
  evidenceIds: string[];
};

export type ImprovementFindingV2 = {
  id: string;
  observableBehavior: string;
  impact: string;
  basis: "fact" | "employee-attested" | "inference" | "unverified";
  evidenceIds: string[];
};

export type CommitmentV2 = {
  id: string;
  findingIds: string[];
  action: string;
  due: string;
  successSignal: string;
  verificationMethod: string;
};

export type PriorCommitmentV2 = {
  id: string;
  action: string;
  due: string;
  status: "pending" | "done" | "missed" | "changed";
  evidenceIds: string[];
  attestation?: string | undefined;
};

export type EmployeeDispositionV2 = {
  findingId: string;
  status: "accepted" | "disputed" | "needs-context";
  reason?: string | undefined;
  commitmentIds: string[];
};

export type TlVerificationV2 = {
  subjectId: string;
  method: string;
  owner: string;
  due: string;
  status: "pending" | "verified" | "rejected";
};

export type AdvisorRunV2 = {
  skill: string;
  stage: string;
  inputDigest: string;
  outputDigest: string;
  decision: "accepted" | "rejected" | "unavailable";
};

export type WorkReportContractV2 = {
  schema: "WorkReportContractV2";
  period: { kind: "daily" | "weekly" | "summary"; label: string; start: string; end: string };
  workItems: WorkItemV2[];
  improvementFindings: ImprovementFindingV2[];
  priorCommitments: PriorCommitmentV2[];
  commitments: CommitmentV2[];
  employeeDispositions: EmployeeDispositionV2[];
  tlVerification: TlVerificationV2[];
  advisorRuns: AdvisorRunV2[];
  dataGaps: string[];
};

export type ValidationResult = { ok: boolean; errors: string[] };
export type PreparedAcknowledgement = {
  token: string;
  contractDigest: string;
  evidenceDigest: string;
};
export type ParsedAcknowledgement = {
  token: string;
  dispositions: Array<{ findingId: string; status: "accepted" | "disputed" | "needs-context"; reason?: string | undefined }>;
  commitmentIds: string[];
};

export type WorkReportLedgerV2 = {
  schema: "WorkReportLedgerV2";
  reportDigest: string;
  contractDigest: string;
  evidenceDigest: string;
  period: WorkReportContractV2["period"];
  commitments: CommitmentV2[];
  priorCommitments: PriorCommitmentV2[];
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const PERSONALITY_LABEL = /(?:\u6001\u5ea6\u5dee|\u61d2\u60f0|\u80fd\u529b\u5dee|\u4e0d\u9760\u8c31|\u6ca1\u8d23\u4efb\u5fc3|lazy|careless|bad attitude|incompetent)/iu;

export function validateWorkReportContract(contract: WorkReportContractV2, evidence: EvidenceBundleV2): ValidationResult {
  const errors: string[] = [];
  if (contract?.schema !== "WorkReportContractV2") return { ok: false, errors: ["schema must be WorkReportContractV2"] };
  const evidenceIds = new Set(evidence.records.map((record) => record.id));
  if (contract.period.label !== evidence.window.label || contract.period.start !== evidence.window.start || contract.period.end !== evidence.window.end) {
    errors.push("contract period must exactly match the evidence window");
  }
  const allIds = [
    ...contract.workItems.map((item) => item.id),
    ...contract.improvementFindings.map((item) => item.id),
    ...contract.priorCommitments.map((item) => item.id),
    ...contract.commitments.map((item) => item.id),
  ];
  if (new Set(allIds).size !== allIds.length) errors.push("contract IDs must be globally unique");
  const findings = new Set(contract.improvementFindings.map((finding) => finding.id));
  const commitments = new Set(contract.commitments.map((commitment) => commitment.id));
  const checkEvidence = (ids: string[], subject: string, allowEmpty = false) => {
    if (!allowEmpty && ids.length === 0) errors.push(`${subject} requires evidence`);
    for (const id of ids) if (!evidenceIds.has(id)) errors.push(`${subject} references unknown evidence ${id}`);
  };

  for (const item of contract.workItems) {
    if (![item.action, item.result, item.impact].every(nonEmpty)) errors.push(`work item ${item.id} requires action, result, and impact`);
    checkEvidence(item.evidenceIds, `work item ${item.id}`);
  }
  for (const finding of contract.improvementFindings) {
    if (PERSONALITY_LABEL.test(finding.observableBehavior)) errors.push(`finding ${finding.id} contains a personality label`);
    if (!nonEmpty(finding.observableBehavior) || !nonEmpty(finding.impact)) errors.push(`finding ${finding.id} requires observable behavior and impact`);
    checkEvidence(finding.evidenceIds, `finding ${finding.id}`, finding.basis === "employee-attested" || finding.basis === "unverified");
  }
  for (const commitment of contract.commitments) {
    if (![commitment.action, commitment.due, commitment.successSignal, commitment.verificationMethod].every(nonEmpty)) errors.push(`commitment ${commitment.id} is incomplete`);
    for (const id of commitment.findingIds) if (!findings.has(id)) errors.push(`commitment ${commitment.id} references unknown finding ${id}`);
  }
  const dispositionIds = new Set<string>();
  for (const disposition of contract.employeeDispositions) {
    dispositionIds.add(disposition.findingId);
    if (!findings.has(disposition.findingId)) errors.push(`disposition references unknown finding ${disposition.findingId}`);
    for (const id of disposition.commitmentIds) if (!commitments.has(id)) errors.push(`disposition references unknown commitment ${id}`);
    if (disposition.status === "accepted" && disposition.commitmentIds.length === 0) errors.push(`accepted finding ${disposition.findingId} requires a commitment`);
    if (disposition.status !== "accepted" && !nonEmpty(disposition.reason)) errors.push(`${disposition.status} finding ${disposition.findingId} requires a reason`);
    if (disposition.status !== "accepted" && !contract.tlVerification.some((item) => item.subjectId === disposition.findingId)) {
      errors.push(`${disposition.status} finding ${disposition.findingId} requires TL verification`);
    }
  }
  for (const id of findings) if (!dispositionIds.has(id)) errors.push(`finding ${id} has no employee disposition`);
  if ((contract.period.kind === "weekly" || contract.period.kind === "summary") && (contract.commitments.length < 1 || contract.commitments.length > 3)) {
    errors.push(`${contract.period.kind} report requires 1 to 3 commitments`);
  }
  for (const prior of contract.priorCommitments) {
    checkEvidence(prior.evidenceIds, `prior commitment ${prior.id}`, true);
    if (prior.status === "done" && prior.evidenceIds.length === 0 && !nonEmpty(prior.attestation)) {
      errors.push(`completed prior commitment ${prior.id} requires evidence or employee attestation`);
    }
  }
  for (const advisor of contract.advisorRuns) {
    if (Object.hasOwn(advisor, "revision") || !/^[a-f0-9]{64}$/u.test(advisor.inputDigest) || !/^[a-f0-9]{64}$/u.test(advisor.outputDigest)) {
      errors.push(`advisor ${advisor.skill} provenance is malformed`);
    }
  }
  if (Object.hasOwn(contract as object, "score") || /"(?:performanceScore|rating)"\s*:/u.test(JSON.stringify(contract))) {
    errors.push("automatic numeric performance score is forbidden");
  }
  return { ok: errors.length === 0, errors };
}

function cell(value: unknown): string {
  return String(value ?? "").replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ").trim() || "—";
}

function evidenceLabel(ids: string[]): string {
  return ids.length > 0 ? ids.map((id) => `\`${id}\``).join(", ") : "—";
}

export function renderWorkReport(contract: WorkReportContractV2, evidence: EvidenceBundleV2): string {
  const checked = validateWorkReportContract(contract, evidence);
  if (!checked.ok) throw new Error(`invalid WorkReportContractV2: ${checked.errors.join("; ")}`);
  const lines: string[] = [
    `# Work report — ${cell(contract.period.label)}`,
    "",
    `- Period: ${cell(contract.period.start)} → ${cell(contract.period.end)}`,
    `- Kind: ${contract.period.kind}`,
    "- Evidence policy: tool facts, employee attestations, inferences, and unverified items remain mechanically distinct. No automatic numeric rating is produced.",
    "",
    "## Work details",
    "",
    "| ID | Action | Result | Status | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...contract.workItems.map((item) => `| ${cell(item.id)} | ${cell(item.action)} | ${cell(item.result)} | ${cell(item.status)} | ${evidenceLabel(item.evidenceIds)} |`),
    "",
    "## Outcomes and impact",
    "",
    ...contract.workItems.map((item) => `- **${cell(item.id)}**: ${cell(item.impact)} (${evidenceLabel(item.evidenceIds)})`),
    "",
    "## Blockers and decisions",
    "",
    ...(contract.dataGaps.length > 0 ? contract.dataGaps.map((gap) => `- Data gap: ${cell(gap)}`) : ["- No recorded blockers."]),
    "",
    "## Improvement observations",
    "",
    "| ID | Observable behavior | Impact | Basis | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...contract.improvementFindings.map((finding) => `| ${cell(finding.id)} | ${cell(finding.observableBehavior)} | ${cell(finding.impact)} | ${finding.basis} | ${evidenceLabel(finding.evidenceIds)} |`),
    "",
    "## Prior commitment review",
    "",
    ...(contract.priorCommitments.length > 0 ? contract.priorCommitments.map((item) => `- ${cell(item.id)} · ${cell(item.action)} · ${item.status} · ${evidenceLabel(item.evidenceIds)}${item.attestation ? ` · Employee attestation: ${cell(item.attestation)}` : ""}`) : ["- No prior commitments."]),
    "",
    "## New commitments",
    "",
    ...contract.commitments.map((item) => `- **${cell(item.id)}**: ${cell(item.action)}; due ${cell(item.due)}; success signal: ${cell(item.successSignal)}; verification: ${cell(item.verificationMethod)}`),
    "",
    "## Employee acknowledgement",
    "",
    ...contract.employeeDispositions.map((item) => `- ${cell(item.findingId)}: ${item.status}${item.reason ? ` (${cell(item.reason)})` : ""}; linked actions: ${item.commitmentIds.map(cell).join(", ") || "—"}`),
    "",
    "## TL verification matrix",
    "",
    "| Subject | Method | Owner | Due | Status |",
    "| --- | --- | --- | --- | --- |",
    ...contract.tlVerification.map((item) => `| ${cell(item.subjectId)} | ${cell(item.method)} | ${cell(item.owner)} | ${cell(item.due)} | ${cell(item.status)} |`),
    "",
    "## Evidence index and data gaps",
    "",
    ...evidence.records.map((record) => `- \`${record.id}\` [${record.verification}/${record.ownership}] ${cell(record.timestamp)} · ${cell(record.locator)} · ${cell(record.summary)} · sha256:${record.digest}`),
    ...[...new Set([...evidence.dataGaps, ...contract.dataGaps])].sort().map((gap) => `- Data gap: ${cell(gap)}`),
    "",
    "## Advisor provenance",
    "",
    ...(contract.advisorRuns.length > 0 ? contract.advisorRuns.map((run) => `- ${cell(run.skill)} · ${cell(run.stage)} · ${run.decision} · input:${run.inputDigest} · output:${run.outputDigest}`) : ["- No external advisor was used; the plugin-internal workflow was applied."]),
    "",
  ];
  return lines.join("\n");
}

export function createAcknowledgement(contract: WorkReportContractV2, evidence: EvidenceBundleV2, nonce = randomBytes(16).toString("hex")): PreparedAcknowledgement {
  const contractDigest = sha256(canonical(contract));
  const evidenceDigest = sha256(canonical(evidence));
  return { token: sha256(`${nonce}\u001f${contractDigest}\u001f${evidenceDigest}`).slice(0, 24), contractDigest, evidenceDigest };
}

export function parseAcknowledgement(value: string): ParsedAcknowledgement {
  const parts = value.split("|").map((part) => part.trim());
  const header = /^# work-report-ack ([a-f0-9]{24})$/u.exec(parts.shift() ?? "");
  if (!header?.[1] || parts.length === 0) throw new Error("exact acknowledgement form is required");
  const dispositions: ParsedAcknowledgement["dispositions"] = [];
  const commitmentIds: string[] = [];
  for (const part of parts) {
    const commitment = /^commit=([A-Za-z][A-Za-z0-9_-]*)$/u.exec(part);
    if (commitment?.[1]) { commitmentIds.push(commitment[1]); continue; }
    const disposition = /^([A-Za-z][A-Za-z0-9_-]*)=(accepted|disputed|needs-context)(?::(.+))?$/u.exec(part);
    if (!disposition?.[1] || !disposition[2]) throw new Error("exact acknowledgement form is required");
    const status = disposition[2] as ParsedAcknowledgement["dispositions"][number]["status"];
    const reason = disposition[3]?.trim();
    if (status !== "accepted" && !reason) throw new Error("disputed and needs-context acknowledgements require a reason");
    dispositions.push({ findingId: disposition[1], status, ...(reason ? { reason } : {}) });
  }
  return { token: header[1], dispositions, commitmentIds };
}

export function validateAcknowledgement(reply: ParsedAcknowledgement, prepared: PreparedAcknowledgement, contract: WorkReportContractV2): ValidationResult {
  const errors: string[] = [];
  if (reply.token !== prepared.token) errors.push("acknowledgement token mismatch");
  if (sha256(canonical(contract)) !== prepared.contractDigest) errors.push("contract changed after prepare");
  const expected = new Map(contract.employeeDispositions.map((item) => [item.findingId, item]));
  for (const finding of contract.improvementFindings) {
    const item = reply.dispositions.find((entry) => entry.findingId === finding.id);
    if (!item) errors.push(`acknowledgement missing ${finding.id}`);
    else if (item.status !== expected.get(finding.id)?.status) errors.push(`acknowledgement disposition mismatch for ${finding.id}`);
  }
  const committed = new Set(reply.commitmentIds);
  for (const item of contract.employeeDispositions.filter((entry) => entry.status === "accepted")) {
    if (!item.commitmentIds.some((id) => committed.has(id))) errors.push(`accepted finding ${item.findingId} is missing its committed action`);
  }
  return { ok: errors.length === 0, errors };
}

export function createLedger(contract: WorkReportContractV2, evidence: EvidenceBundleV2, markdown: string): WorkReportLedgerV2 {
  return {
    schema: "WorkReportLedgerV2",
    reportDigest: sha256(markdown),
    contractDigest: sha256(canonical(contract)),
    evidenceDigest: sha256(canonical(evidence)),
    period: structuredClone(contract.period),
    commitments: structuredClone(contract.commitments),
    priorCommitments: structuredClone(contract.priorCommitments),
  };
}
