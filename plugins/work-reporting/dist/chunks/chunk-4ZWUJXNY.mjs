// harness-source-hash: sha256:fe5ec748ad17194faa3a78be45a17a33a1bf553e9a40156cf31b6308b1cb38f8
import {
  buildReportWindow,
  collectTranscriptActivity,
  isRecord,
  scanTranscripts
} from "./chunk-ALDQ5R4Y.mjs";

// plugins/work-reporting/src/lib/report-integrity.ts
import { createHash } from "node:crypto";
var SEAL_PREFIX = "<!-- work-reporting:sha256:";
var SEAL_PATTERN = /^<!-- work-reporting:sha256:([a-f0-9]{64}) -->$/gmu;
var CHAIN_V2_PREFIX = "<!-- work-reporting:chain-v2:";
var CHAIN_V2_PATTERN = /^<!-- work-reporting:chain-v2:prev-length=(\d+);prev=([a-f0-9]{64});sha256=([a-f0-9]{64}) -->$/gmu;
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function sealReport(body) {
  const bytes = String(body ?? "");
  if (bytes.includes(SEAL_PREFIX)) {
    throw new Error("report body contains a reserved seal marker");
  }
  if (!bytes.endsWith("\n")) {
    throw new Error("report body must end with a newline");
  }
  return `${bytes}${SEAL_PREFIX}${sha256(bytes)} -->
`;
}
function appendChainV2(previous, block) {
  const checked = verifyReport(previous);
  if (!checked.ok) throw new Error(`report cannot be chained: ${checked.reason}`);
  if (!block || block.includes(SEAL_PREFIX) || block.includes(CHAIN_V2_PREFIX)) throw new Error("addition contains a reserved integrity marker");
  const prefix = `${previous}${block}`;
  const marker = `${CHAIN_V2_PREFIX}prev-length=${previous.length};prev=${sha256(previous)};sha256=${sha256(prefix)} -->
`;
  return `${prefix}${marker}`;
}
function verifyReport(content) {
  const text = String(content ?? "");
  const matches = [...text.matchAll(SEAL_PATTERN)];
  if (matches.length === 0) {
    if (text.includes(SEAL_PREFIX)) {
      return { ok: false, kind: "malformed", reason: "seal marker is malformed" };
    }
    return { ok: false, kind: "unsealed", reason: "seal marker is missing" };
  }
  if (matches.length !== 1) {
    return { ok: false, kind: "malformed", reason: "report must contain exactly one seal marker" };
  }
  const marker = matches[0];
  if (marker === void 0 || marker.index === void 0) {
    return { ok: false, kind: "malformed", reason: "seal marker is malformed" };
  }
  const body = text.slice(0, marker.index);
  const digest = marker[1];
  if (digest === void 0) {
    return { ok: false, kind: "malformed", reason: "seal marker is malformed" };
  }
  const suffix = text.slice(marker.index + marker[0].length);
  if (suffix.includes(SEAL_PREFIX)) {
    return { ok: false, kind: "malformed", reason: "report suffix contains a reserved seal marker" };
  }
  if (sha256(body) !== digest) {
    return { ok: false, kind: "mismatch", reason: "report body SHA-256 does not match the seal" };
  }
  const chainMatches = [...text.matchAll(CHAIN_V2_PATTERN)];
  if (suffix.includes(CHAIN_V2_PREFIX) && chainMatches.length === 0) {
    return { ok: false, kind: "malformed", reason: "V2 chain marker is malformed" };
  }
  const baseMarkerEnd = marker.index + marker[0].length;
  const baseEnd = text[baseMarkerEnd] === "\n" ? baseMarkerEnd + 1 : baseMarkerEnd;
  if (chainMatches.length === 0) {
    return { ok: true, body, digest, suffix, additions: 0, legacySuffixUnverified: text.slice(baseEnd).trim().length > 0 };
  }
  let previousEnd = baseEnd;
  let legacySuffixUnverified = false;
  for (let index = 0; index < chainMatches.length; index += 1) {
    const chain = chainMatches[index];
    if (!chain || chain.index === void 0 || !chain[1] || !chain[2] || !chain[3]) {
      return { ok: false, kind: "malformed", reason: "V2 chain marker is malformed" };
    }
    const previousLength = Number.parseInt(chain[1], 10);
    if (!Number.isSafeInteger(previousLength) || previousLength < previousEnd || previousLength >= chain.index) {
      return { ok: false, kind: "malformed", reason: "V2 chain boundary is invalid" };
    }
    if (index > 0 && previousLength !== previousEnd) {
      return { ok: false, kind: "mismatch", reason: "V2 chain does not continue from the previous marker" };
    }
    if (index === 0 && text.slice(baseEnd, previousLength).trim()) legacySuffixUnverified = true;
    if (sha256(text.slice(0, previousLength)) !== chain[2]) {
      return { ok: false, kind: "mismatch", reason: "V2 chain previous-file digest mismatch" };
    }
    if (sha256(text.slice(0, chain.index)) !== chain[3]) {
      return { ok: false, kind: "mismatch", reason: "V2 chain addition digest mismatch" };
    }
    const end = chain.index + chain[0].length;
    previousEnd = text[end] === "\n" ? end + 1 : end;
  }
  if (text.slice(previousEnd).length > 0) {
    return { ok: false, kind: "mismatch", reason: "report has an unauthenticated tail after the V2 chain" };
  }
  return { ok: true, body, digest, suffix, additions: chainMatches.length, legacySuffixUnverified };
}

// plugins/work-reporting/src/lib/report-store.ts
import { randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
var DATE = /^\d{4}-\d{2}-\d{2}$/u;
var WEEK = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/u;
function requireDate(value, label) {
  const text = String(value ?? "");
  if (!DATE.test(text)) throw new Error(`${label} expects YYYY-MM-DD`);
  const [year, month, day] = text.split("-").map(Number);
  if (year === void 0 || month === void 0 || day === void 0) {
    throw new Error(`${label} expects YYYY-MM-DD`);
  }
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    throw new Error(`${label} is not a valid date`);
  }
  return text;
}
function reportsHome(home) {
  return resolve(home ?? process.env.HOME ?? homedir(), ".ai-experts");
}
function errorCode(error) {
  return isRecord(error) ? error.code : void 0;
}
function errorMessage(error) {
  return isRecord(error) && error.message != null ? String(error.message) : String(error);
}
function reportPath(options) {
  const home = options.home ?? process.env.HOME ?? homedir();
  if (options.kind === "daily") {
    const date = requireDate(options.date, "--date");
    return join(reportsHome(home), "daily-reports", `${date}.md`);
  }
  if (options.kind === "weekly") {
    const week = String(options.week ?? "");
    if (!WEEK.test(week)) throw new Error("--week expects YYYY-Www");
    return join(reportsHome(home), "weekly-reports", `${week}.md`);
  }
  if (options.kind === "summary") {
    const from = requireDate(options.from, "--from");
    const to = requireDate(options.to, "--to");
    if (from > to) throw new Error("--from must not be after --to");
    return join(reportsHome(home), "work-summary-reports", `${from}_to_${to}.md`);
  }
  throw new Error(`unknown report kind: ${String(options.kind)}`);
}
function isProtectedReportPath(candidate, home) {
  const root = reportsHome(home);
  const absolute = resolve(candidate);
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || resolve(root, rel) !== absolute) return false;
  const parts = rel.split(sep);
  const folder = parts[0];
  const file = parts[1];
  return parts.length === 2 && Boolean(folder?.endsWith("-reports")) && Boolean(file);
}
async function rejectSymlink(path) {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) throw new Error(`refusing symbolic-link report path: ${path}`);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}
async function prepareReportDirectory(path) {
  const reportDirectory = dirname(path);
  const expertsDirectory = dirname(reportDirectory);
  await rejectSymlink(expertsDirectory);
  await rejectSymlink(reportDirectory);
  await mkdir(reportDirectory, { recursive: true, mode: 448 });
  await rejectSymlink(expertsDirectory);
  await rejectSymlink(reportDirectory);
}
async function atomicWrite(path, content) {
  await prepareReportDirectory(path);
  await rejectSymlink(path);
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(temporary, content, { encoding: "utf8", mode: 384, flag: "wx" });
    await rename(temporary, path);
    await chmod(path, 384);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {
    });
    throw error;
  }
}
async function readUtf8(path, label) {
  try {
    return await readFile(resolve(path), "utf8");
  } catch (error) {
    throw new Error(`${label} cannot be read: ${errorMessage(error)}`);
  }
}
async function saveReport(options) {
  const body = await readUtf8(options.input, "report input");
  return saveReportContent({ ...options, body });
}
async function saveReportContent(options) {
  const target = reportPath(options);
  const body = options.body;
  if (!body.trim()) throw new Error("report body is empty");
  if (body.includes(SEAL_PREFIX)) throw new Error("report body contains a reserved seal marker");
  const normalized = body.endsWith("\n") ? body : `${body}
`;
  try {
    const existing = await readFile(target, "utf8");
    const checked = verifyReport(existing);
    if (checked.ok) throw new Error(`report is already sealed: ${target}`);
    if (checked.kind !== "unsealed") throw new Error(`existing report integrity is invalid: ${checked.reason}`);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
  const sealed = sealReport(normalized);
  await atomicWrite(target, sealed);
  let ledgerPath;
  if (options.ledger !== void 0) {
    ledgerPath = `${target}.ledger.json`;
    await atomicWrite(ledgerPath, `${JSON.stringify(options.ledger, null, 2)}
`);
  }
  const verified = verifyReport(sealed);
  return { path: target, digest: verified.ok ? verified.digest : void 0, bytes: Buffer.byteLength(sealed), ...ledgerPath ? { ledgerPath } : {} };
}
async function appendReport(options) {
  const target = resolve(options.report ?? "");
  if (!isProtectedReportPath(target, options.home)) throw new Error("--report must target ~/.ai-experts/*-reports/*");
  await rejectSymlink(target);
  const before = await readUtf8(target, "sealed report");
  const checked = verifyReport(before);
  if (!checked.ok) throw new Error(`report cannot be appended: ${checked.reason}`);
  const addition = await readUtf8(options.input, "addition input");
  if (!addition.trim()) throw new Error("addition is empty");
  if (addition.includes(SEAL_PREFIX) || addition.includes(CHAIN_V2_PREFIX)) throw new Error("addition contains a reserved seal marker");
  const timestamp = new Date(options.now ?? Date.now()).toISOString();
  const block = `
## Addition \u2014 ${timestamp}

${addition.trimEnd()}
`;
  await atomicWrite(target, appendChainV2(before, block));
  return { path: target, digest: checked.digest, appendedBytes: Buffer.byteLength(block) };
}

// plugins/work-reporting/src/lib/report-contract.ts
import { createHash as createHash2, randomBytes as randomBytes2 } from "node:crypto";
function sha2562(value) {
  return createHash2("sha256").update(value).digest("hex");
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
var PERSONALITY_LABEL = /(?:\u6001\u5ea6\u5dee|\u61d2\u60f0|\u80fd\u529b\u5dee|\u4e0d\u9760\u8c31|\u6ca1\u8d23\u4efb\u5fc3|lazy|careless|bad attitude|incompetent)/iu;
function validateWorkReportContract(contract, evidence) {
  const errors = [];
  if (contract?.schema !== "WorkReportContractV2") return { ok: false, errors: ["schema must be WorkReportContractV2"] };
  const evidenceIds = new Set(evidence.records.map((record) => record.id));
  if (contract.period.label !== evidence.window.label || contract.period.start !== evidence.window.start || contract.period.end !== evidence.window.end) {
    errors.push("contract period must exactly match the evidence window");
  }
  const allIds = [
    ...contract.workItems.map((item) => item.id),
    ...contract.improvementFindings.map((item) => item.id),
    ...contract.priorCommitments.map((item) => item.id),
    ...contract.commitments.map((item) => item.id)
  ];
  if (new Set(allIds).size !== allIds.length) errors.push("contract IDs must be globally unique");
  const findings = new Set(contract.improvementFindings.map((finding) => finding.id));
  const commitments = new Set(contract.commitments.map((commitment) => commitment.id));
  const checkEvidence = (ids, subject, allowEmpty = false) => {
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
  const dispositionIds = /* @__PURE__ */ new Set();
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
  if (Object.hasOwn(contract, "score") || /"(?:performanceScore|rating)"\s*:/u.test(JSON.stringify(contract))) {
    errors.push("automatic numeric performance score is forbidden");
  }
  return { ok: errors.length === 0, errors };
}
function cell(value) {
  return String(value ?? "").replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ").trim() || "\u2014";
}
function evidenceLabel(ids) {
  return ids.length > 0 ? ids.map((id) => `\`${id}\``).join(", ") : "\u2014";
}
function renderWorkReport(contract, evidence) {
  const checked = validateWorkReportContract(contract, evidence);
  if (!checked.ok) throw new Error(`invalid WorkReportContractV2: ${checked.errors.join("; ")}`);
  const lines = [
    `# Work report \u2014 ${cell(contract.period.label)}`,
    "",
    `- Period: ${cell(contract.period.start)} \u2192 ${cell(contract.period.end)}`,
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
    ...contract.dataGaps.length > 0 ? contract.dataGaps.map((gap) => `- Data gap: ${cell(gap)}`) : ["- No recorded blockers."],
    "",
    "## Improvement observations",
    "",
    "| ID | Observable behavior | Impact | Basis | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...contract.improvementFindings.map((finding) => `| ${cell(finding.id)} | ${cell(finding.observableBehavior)} | ${cell(finding.impact)} | ${finding.basis} | ${evidenceLabel(finding.evidenceIds)} |`),
    "",
    "## Prior commitment review",
    "",
    ...contract.priorCommitments.length > 0 ? contract.priorCommitments.map((item) => `- ${cell(item.id)} \xB7 ${cell(item.action)} \xB7 ${item.status} \xB7 ${evidenceLabel(item.evidenceIds)}${item.attestation ? ` \xB7 Employee attestation: ${cell(item.attestation)}` : ""}`) : ["- No prior commitments."],
    "",
    "## New commitments",
    "",
    ...contract.commitments.map((item) => `- **${cell(item.id)}**: ${cell(item.action)}; due ${cell(item.due)}; success signal: ${cell(item.successSignal)}; verification: ${cell(item.verificationMethod)}`),
    "",
    "## Employee acknowledgement",
    "",
    ...contract.employeeDispositions.map((item) => `- ${cell(item.findingId)}: ${item.status}${item.reason ? ` (${cell(item.reason)})` : ""}; linked actions: ${item.commitmentIds.map(cell).join(", ") || "\u2014"}`),
    "",
    "## TL verification matrix",
    "",
    "| Subject | Method | Owner | Due | Status |",
    "| --- | --- | --- | --- | --- |",
    ...contract.tlVerification.map((item) => `| ${cell(item.subjectId)} | ${cell(item.method)} | ${cell(item.owner)} | ${cell(item.due)} | ${cell(item.status)} |`),
    "",
    "## Evidence index and data gaps",
    "",
    ...evidence.records.map((record) => `- \`${record.id}\` [${record.verification}/${record.ownership}] ${cell(record.timestamp)} \xB7 ${cell(record.locator)} \xB7 ${cell(record.summary)} \xB7 sha256:${record.digest}`),
    ...[.../* @__PURE__ */ new Set([...evidence.dataGaps, ...contract.dataGaps])].sort().map((gap) => `- Data gap: ${cell(gap)}`),
    "",
    "## Advisor provenance",
    "",
    ...contract.advisorRuns.length > 0 ? contract.advisorRuns.map((run) => `- ${cell(run.skill)} \xB7 ${cell(run.stage)} \xB7 ${run.decision} \xB7 input:${run.inputDigest} \xB7 output:${run.outputDigest}`) : ["- No external advisor was used; the plugin-internal workflow was applied."],
    ""
  ];
  return lines.join("\n");
}
function createAcknowledgement(contract, evidence, nonce = randomBytes2(16).toString("hex")) {
  const contractDigest = sha2562(canonical(contract));
  const evidenceDigest = sha2562(canonical(evidence));
  return { token: sha2562(`${nonce}${contractDigest}${evidenceDigest}`).slice(0, 24), contractDigest, evidenceDigest };
}
function parseAcknowledgement(value) {
  const parts = value.split("|").map((part) => part.trim());
  const header = /^# work-report-ack ([a-f0-9]{24})$/u.exec(parts.shift() ?? "");
  if (!header?.[1] || parts.length === 0) throw new Error("exact acknowledgement form is required");
  const dispositions = [];
  const commitmentIds = [];
  for (const part of parts) {
    const commitment = /^commit=([A-Za-z][A-Za-z0-9_-]*)$/u.exec(part);
    if (commitment?.[1]) {
      commitmentIds.push(commitment[1]);
      continue;
    }
    const disposition = /^([A-Za-z][A-Za-z0-9_-]*)=(accepted|disputed|needs-context)(?::(.+))?$/u.exec(part);
    if (!disposition?.[1] || !disposition[2]) throw new Error("exact acknowledgement form is required");
    const status = disposition[2];
    const reason = disposition[3]?.trim();
    if (status !== "accepted" && !reason) throw new Error("disputed and needs-context acknowledgements require a reason");
    dispositions.push({ findingId: disposition[1], status, ...reason ? { reason } : {} });
  }
  return { token: header[1], dispositions, commitmentIds };
}
function validateAcknowledgement(reply, prepared, contract) {
  const errors = [];
  if (reply.token !== prepared.token) errors.push("acknowledgement token mismatch");
  if (sha2562(canonical(contract)) !== prepared.contractDigest) errors.push("contract changed after prepare");
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
function createLedger(contract, evidence, markdown) {
  return {
    schema: "WorkReportLedgerV2",
    reportDigest: sha2562(markdown),
    contractDigest: sha2562(canonical(contract)),
    evidenceDigest: sha2562(canonical(evidence)),
    period: structuredClone(contract.period),
    commitments: structuredClone(contract.commitments),
    priorCommitments: structuredClone(contract.priorCommitments)
  };
}

// plugins/work-reporting/src/lib/report-candidate.ts
import { readFile as readFile2 } from "node:fs/promises";
import { resolve as resolve2 } from "node:path";
async function readJson(path, label) {
  try {
    return JSON.parse(await readFile2(resolve2(path), "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid readable JSON: ${String(error)}`);
  }
}
async function readReportCandidate(args, cwd = process.cwd()) {
  if (args.contract) {
    if (!args.evidence) throw new Error("--evidence is required with --contract");
    const contractPath = resolve2(cwd, args.contract);
    const evidencePath = resolve2(cwd, args.evidence);
    const contract = await readJson(contractPath, "contract");
    const evidence = await readJson(evidencePath, "evidence");
    const checked = validateWorkReportContract(contract, evidence);
    if (!checked.ok) throw new Error(`invalid WorkReportContractV2: ${checked.errors.join("; ")}`);
    const body2 = renderWorkReport(contract, evidence);
    return { body: body2, schema: "WorkReportContractV2", candidatePath: contractPath, evidencePath, contract, evidence, ledger: createLedger(contract, evidence, body2) };
  }
  if (!args.input) throw new Error("--input or --contract is required");
  const candidatePath = resolve2(cwd, args.input);
  let body = await readFile2(candidatePath, "utf8");
  if (!body.trim()) throw new Error("candidate content is empty");
  if (body.includes(SEAL_PREFIX)) throw new Error("candidate content contains a reserved seal marker");
  if (!body.endsWith("\n")) body += "\n";
  return { body, schema: "legacy-markdown", candidatePath, evidencePath: null, contract: null, evidence: null, ledger: null };
}

// plugins/work-reporting/src/lib/report-cli.ts
import { readFile as readFile3, writeFile as writeFile2 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { resolve as resolve3 } from "node:path";
var ACTIONS = /* @__PURE__ */ new Set(["collect", "scan", "prepare", "save", "addition-prepare", "append", "verify"]);
function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (value == null || value.startsWith("-")) throw new Error(`${flag} requires a value`);
  return value;
}
function isReportAction(value) {
  return ACTIONS.has(value);
}
function requiredArg(value, flag) {
  if (value === void 0) throw new Error(`${flag} is required`);
  return value;
}
function parseReportArgs(kind, action, argv) {
  if (!isReportAction(action)) throw new Error(`unknown report action: ${action}`);
  const result = {
    platform: "all",
    maxSessions: 20,
    format: "json",
    skipGit: false,
    skipRemote: false,
    repos: [],
    maxRepos: 12,
    maxCommits: 100,
    help: false
  };
  const stringFlags = /* @__PURE__ */ new Map([
    ["--date", "date"],
    ["--week", "week"],
    ["--from", "from"],
    ["--to", "to"],
    ["--input", "input"],
    ["--report", "report"],
    ["--contract", "contract"],
    ["--evidence", "evidence"],
    ["--output", "output"],
    ["--platform", "platform"],
    ["--format", "format"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      return {
        ...result,
        help: true,
        platform: result.platform === "claude" || result.platform === "codex" ? result.platform : "all",
        format: result.format === "markdown" ? result.format : "json"
      };
    }
    if (arg === "--skip-git") {
      result.skipGit = true;
      continue;
    }
    if (arg === "--skip-remote") {
      result.skipRemote = true;
      continue;
    }
    if (arg === "--repo") {
      result.repos.push(valueAfter(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--max-sessions") {
      result.maxSessions = Number.parseInt(valueAfter(argv, index, arg), 10);
      index += 1;
      continue;
    }
    if (arg === "--max-repos" || arg === "--max-commits") {
      const value = Number.parseInt(valueAfter(argv, index, arg), 10);
      if (arg === "--max-repos") result.maxRepos = value;
      else result.maxCommits = value;
      index += 1;
      continue;
    }
    const key = stringFlags.get(arg ?? "");
    if (key) {
      result[key] = valueAfter(argv, index, arg ?? "");
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (result.platform !== "all" && result.platform !== "claude" && result.platform !== "codex") {
    throw new Error("--platform expects claude, codex, or all");
  }
  if (result.format !== "json" && result.format !== "markdown") {
    throw new Error("--format expects json or markdown");
  }
  if (!Number.isInteger(result.maxSessions) || result.maxSessions < 1 || result.maxSessions > 200) throw new Error("--max-sessions expects an integer from 1 to 200");
  if (!Number.isInteger(result.maxRepos) || result.maxRepos < 1 || result.maxRepos > 50) throw new Error("--max-repos expects an integer from 1 to 50");
  if (!Number.isInteger(result.maxCommits) || result.maxCommits < 1 || result.maxCommits > 500) throw new Error("--max-commits expects an integer from 1 to 500");
  if (kind === "summary" && (!result.from || !result.to)) throw new Error("--from and --to are required");
  if ((action === "prepare" || action === "save") && !result.input && !result.contract) {
    throw new Error("--input or --contract is required");
  }
  if ((action === "addition-prepare" || action === "append") && !result.input) {
    throw new Error("--input is required");
  }
  if (result.contract && !result.evidence) throw new Error("--evidence is required with --contract");
  if ((action === "addition-prepare" || action === "append" || action === "verify") && !result.report) {
    throw new Error("--report is required");
  }
  return {
    ...result,
    platform: result.platform,
    format: result.format
  };
}
function periodOptions(kind, args, home) {
  return { kind, date: args.date, week: args.week, from: args.from, to: args.to, home };
}
function assertCandidatePeriod(kind, candidate, period) {
  if (!candidate.contract) return;
  const window = buildReportWindow(period);
  if (candidate.contract.period.kind !== kind || candidate.contract.period.label !== window.label) {
    throw new Error("WorkReportContractV2 period does not match the official command period");
  }
}
function localDateLabel(now) {
  const date = new Date(now);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
function isoWeekLabel(now) {
  const date = new Date(now);
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = thursday.getDay() || 7;
  thursday.setDate(thursday.getDate() + 4 - day);
  const year = thursday.getFullYear();
  const first = new Date(year, 0, 1);
  const week = Math.ceil(((thursday.getTime() - first.getTime()) / 864e5 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
function applyPeriodDefaults(kind, args, now) {
  if (kind === "daily" && !args.date) return { ...args, date: localDateLabel(now) };
  if (kind === "weekly" && !args.week) return { ...args, week: isoWeekLabel(now) };
  return args;
}
function renderScanMarkdown(report) {
  const lines = [
    `# transcript scan \u2014 ${report.window.label}`,
    "",
    `- window: ${report.window.start} \u2192 ${report.window.end}`,
    `- sessions: ${report.overview.sessionCount}`
  ];
  for (const session of report.sessions) {
    lines.push("", `## [${session.platform}] ${session.sessionId}`);
    lines.push(`- project: ${session.project ?? "n/a"}`);
    for (const item of session.evidence) lines.push(`- L${item.line} ${item.role ?? "event"}: ${item.text}`);
  }
  if (report.dataGaps.length > 0) lines.push("", "## data gaps", ...report.dataGaps.map((gap) => `- ${gap}`));
  return lines.join("\n");
}
async function readCandidate(input) {
  const value = await readFile3(resolve3(input), "utf8");
  if (!value.trim()) throw new Error("candidate content is empty");
  if (value.includes(SEAL_PREFIX)) throw new Error("candidate content contains a reserved seal marker");
  return value.endsWith("\n") ? value : `${value}
`;
}
async function executeReportCommand({
  kind,
  action,
  argv,
  env = process.env,
  now = Date.now()
}) {
  const args = applyPeriodDefaults(kind, parseReportArgs(kind, action, argv), now);
  if (args.help) return { help: true, kind, action };
  const home = env.HOME || homedir2();
  const period = periodOptions(kind, args, home);
  if (action === "collect") return collectTranscriptActivity({
    ...period,
    env,
    platform: args.platform,
    maxSessions: args.maxSessions,
    skipGit: args.skipGit,
    skipRemote: args.skipRemote,
    repos: args.repos,
    maxRepos: args.maxRepos,
    maxCommits: args.maxCommits
  });
  if (action === "scan") {
    const window = buildReportWindow(period);
    return scanTranscripts({ window, env, platform: args.platform, maxSessions: args.maxSessions });
  }
  if (action === "prepare") {
    const candidate = await readReportCandidate(args);
    assertCandidatePeriod(kind, candidate, period);
    return { kind, action, schema: candidate.schema, target: reportPath(period), candidateSha256: sha256(candidate.body), bytes: Buffer.byteLength(candidate.body) };
  }
  if (action === "save") {
    if (!args.contract) return { kind, action, ...await saveReport({ ...period, input: requiredArg(args.input, "--input") }) };
    const candidate = await readReportCandidate(args);
    assertCandidatePeriod(kind, candidate, period);
    return { kind, action, schema: candidate.schema, ...await saveReportContent({ ...period, body: candidate.body, ledger: candidate.ledger }) };
  }
  if (action === "verify") {
    const report = requiredArg(args.report, "--report");
    const content = await readFile3(resolve3(report), "utf8");
    const checked = verifyReport(content);
    return { kind: "report", action, path: resolve3(report), ...checked };
  }
  if (action === "addition-prepare") {
    const report = requiredArg(args.report, "--report");
    const content = await readFile3(resolve3(report), "utf8");
    const checked = verifyReport(content);
    if (!checked.ok) throw new Error(`report cannot be appended: ${checked.reason}`);
    const addition = await readCandidate(requiredArg(args.input, "--input"));
    return { kind: "report", action, path: resolve3(report), reportSha256: sha256(content), candidateSha256: sha256(addition), bytes: Buffer.byteLength(addition) };
  }
  if (action === "append") {
    return {
      kind: "report",
      action,
      ...await appendReport({
        report: requiredArg(args.report, "--report"),
        input: requiredArg(args.input, "--input"),
        home
      })
    };
  }
  throw new Error(`unsupported action: ${action}`);
}
function usage(kind, action) {
  const period = kind === "daily" ? "--date YYYY-MM-DD" : kind === "weekly" ? "--week YYYY-Www" : kind === "summary" ? "--from YYYY-MM-DD --to YYYY-MM-DD" : "--report PATH";
  const input = action === "prepare" || action === "save" || action === "addition-prepare" || action === "append" ? " --input PATH" : "";
  return `Usage: ${kind}-${action} ${period}${input}`;
}
function errorMessage2(error) {
  return isRecord(error) && error.message != null ? String(error.message) : String(error);
}
function isScanReport(value) {
  return isRecord(value.window) && Array.isArray(value.sessions) && Array.isArray(value.dataGaps) && isRecord(value.overview);
}
async function runCli(kind, action, argv = process.argv.slice(2), env = process.env) {
  try {
    const result = await executeReportCommand({ kind, action, argv, env });
    if (result.help === true) {
      process.stdout.write(`${usage(kind, action)}
`);
      return 0;
    }
    const parsed = parseReportArgs(kind, action, argv);
    if (parsed.output) {
      if (action !== "collect" && action !== "scan") throw new Error("--output is supported only by collect and scan");
      const target = resolve3(parsed.output);
      if (isProtectedReportPath(target, env.HOME)) throw new Error("--output cannot target the protected report tree");
      await writeFile2(target, `${JSON.stringify(result, null, 2)}
`, { encoding: "utf8", mode: 384, flag: "wx" });
      process.stdout.write(`${JSON.stringify({ action, output: target, bytes: Buffer.byteLength(JSON.stringify(result)) })}
`);
      return 0;
    }
    const formatIndex = argv.indexOf("--format");
    const format = formatIndex >= 0 ? argv[formatIndex + 1] : "json";
    if (action === "scan" && format === "markdown" && isScanReport(result)) {
      process.stdout.write(`${renderScanMarkdown(result)}
`);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${errorMessage2(error)}
${usage(kind, action)}
`);
    return 2;
  }
}

export {
  sha256,
  verifyReport,
  reportPath,
  isProtectedReportPath,
  createAcknowledgement,
  parseAcknowledgement,
  validateAcknowledgement,
  readReportCandidate,
  parseReportArgs,
  runCli
};
