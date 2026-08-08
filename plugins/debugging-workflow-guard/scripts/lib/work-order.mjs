import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const SCHEMA = "debug-work-order/v1";
const WORK_STATUSES = new Set(["open", "paused", "closed", "aborted"]);
const RUN_STATES = new Set(["active", "paused", "closed"]);
const RUN_MODES = new Set(["investigate-only", "investigate-and-fix"]);
const BUG_STATUSES = new Set(["queued", "investigating", "fixing", "verifying", "resolved", "blocked", "deferred", "duplicate", "architecture-review"]);
const ACTIVE_BUG_STATUSES = new Set(["investigating", "fixing", "verifying"]);
const TERMINAL_BUG_STATUSES = new Set(["resolved", "blocked", "deferred", "duplicate", "architecture-review"]);
const HYPOTHESIS_STATUSES = new Set(["open", "supported", "falsified"]);
const ROOT_STATUSES = new Set(["unknown", "inferred", "supported"]);
const FIX_STATUSES = new Set(["not-started", "in-progress", "applied", "reverted"]);
const FENCE = /```json[ \t]+debug-work-order\/v1[ \t]*\r?\n([\s\S]*?)\r?\n```/gu;

function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function text(value, max = 8000) { return typeof value === "string" && value.trim().length > 0 && Buffer.byteLength(value, "utf8") <= max; }
function nullableText(value, max = 8000) { return value === null || value === "" || text(value, max); }
function accepted(values) { return [...values].join(", "); }
function exactKeys(value, allowed, at, findings) {
  if (!object(value)) return;
  for (const key of Object.keys(value)) if (!allowed.includes(key)) findings.push(`${at} contains unknown field: ${key}`);
}
function stringArray(value, at, findings) {
  if (!Array.isArray(value) || value.some((item) => !text(item, 500))) findings.push(`${at} must be an array of non-empty strings`);
}
function receiptIdArray(value, at, findings) {
  if (!Array.isArray(value) || value.some((item) => !/^R-[0-9]+$/u.test(String(item)))) findings.push(`${at} must be an array of R-N receipt ids`);
}
function receiptReference(value, at, findings) {
  if (!object(value)) { findings.push(`${at} must be a receipt-reference object`); return; }
  exactKeys(value, ["receiptId"], at, findings);
  if (!/^R-[0-9]+$/u.test(String(value.receiptId ?? ""))) findings.push(`${at}.receiptId must match R-N`);
}

export function extractWorkOrder(rawText) {
  const textValue = String(rawText ?? "");
  const matches = [...textValue.matchAll(FENCE)];
  if (matches.length !== 1) return { ok: false, error: `expected exactly one json debug-work-order/v1 block; found ${matches.length}` };
  try {
    const value = JSON.parse(matches[0][1]);
    return object(value) ? { ok: true, value } : { ok: false, error: "work order root must be an object" };
  } catch (error) {
    return { ok: false, error: `work order JSON parse failed: ${error?.message ?? error}` };
  }
}

export function validateWorkOrder(raw, config) {
  const findings = [];
  if (!object(raw)) return { valid: false, findings: ["work order root must be an object"], workOrder: null };
  exactKeys(raw, ["schema", "id", "status", "run", "activeBugId", "bugs", "resume"], "work order", findings);
  if (raw.schema !== SCHEMA) findings.push(`schema must be ${SCHEMA}`);
  if (!/^DWO-[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(String(raw.id ?? ""))) findings.push("id must match DWO-<stable-id>");
  if (!WORK_STATUSES.has(raw.status)) findings.push("status is invalid");

  if (!object(raw.run)) findings.push("run must be an object");
  else {
    exactKeys(raw.run, ["epoch", "state", "mode"], "run", findings);
    if (!Number.isSafeInteger(raw.run.epoch) || raw.run.epoch < 1) findings.push("run.epoch must be a positive integer");
    if (!RUN_STATES.has(raw.run.state)) findings.push(`run.state must be one of: ${accepted(RUN_STATES)}`);
    if (!RUN_MODES.has(raw.run.mode)) findings.push(`run.mode must be one of: ${accepted(RUN_MODES)}`);
  }
  const alignedRunState = { open: "active", paused: "paused", closed: "closed", aborted: "closed" }[raw.status];
  if (alignedRunState && raw.run?.state !== alignedRunState) findings.push(`status ${raw.status} requires run.state ${alignedRunState}`);

  const maxBugs = config?.limits?.maxBugs ?? 50;
  const maxHypotheses = config?.limits?.maxHypothesesPerBug ?? 20;
  if (!Array.isArray(raw.bugs) || raw.bugs.length < 1 || raw.bugs.length > maxBugs) findings.push(`bugs must contain 1..${maxBugs} items`);
  const bugIds = new Set();
  const bugs = Array.isArray(raw.bugs) ? raw.bugs : [];
  for (const [index, bug] of bugs.entries()) {
    const at = `bugs[${index}]`;
    if (!object(bug)) { findings.push(`${at} must be an object`); continue; }
    exactKeys(bug, ["id", "summary", "goal", "status", "priority", "dependsOn", "duplicateOf", "rootCauseGroup", "symptom", "hypotheses", "rootCause", "fix", "verification", "attempts", "residualRisks"], at, findings);
    if (!/^BUG-[0-9]{3,6}$/u.test(String(bug.id ?? ""))) findings.push(`${at}.id must match BUG-NNN`);
    else if (bugIds.has(bug.id)) findings.push(`duplicate bug id: ${bug.id}`);
    else bugIds.add(bug.id);
    if (!text(bug.summary, 500)) findings.push(`${at}.summary is required`);
    if (!['diagnose', 'fix'].includes(bug.goal)) findings.push(`${at}.goal must be diagnose or fix`);
    if (!BUG_STATUSES.has(bug.status)) findings.push(`${at}.status must be one of: ${accepted(BUG_STATUSES)}`);
    if (!['critical', 'high', 'medium', 'low'].includes(bug.priority)) findings.push(`${at}.priority is invalid`);
    stringArray(bug.dependsOn, `${at}.dependsOn`, findings);
    if (!nullableText(bug.duplicateOf, 64)) findings.push(`${at}.duplicateOf must be null or an id`);
    if (!nullableText(bug.rootCauseGroup, 64)) findings.push(`${at}.rootCauseGroup must be null or a string`);
    if (bug.status === "duplicate" && !text(bug.duplicateOf, 64)) findings.push(`${at}.duplicateOf is required for duplicate status`);

    if (!object(bug.symptom)) findings.push(`${at}.symptom must be an object`);
    else {
      exactKeys(bug.symptom, ["expected", "actual", "reproduction", "environment"], `${at}.symptom`, findings);
      for (const key of ["expected", "actual", "reproduction", "environment"]) if (!text(bug.symptom[key])) findings.push(`${at}.symptom.${key} is required`);
    }
    if (!Array.isArray(bug.hypotheses) || bug.hypotheses.length < 2 || bug.hypotheses.length > maxHypotheses) findings.push(`${at}.hypotheses must contain 2..${maxHypotheses} items`);
    const hypothesisIds = new Set();
    for (const [hIndex, hypothesis] of (Array.isArray(bug.hypotheses) ? bug.hypotheses : []).entries()) {
      const hat = `${at}.hypotheses[${hIndex}]`;
      if (!object(hypothesis)) { findings.push(`${hat} must be an object`); continue; }
      exactKeys(hypothesis, ["id", "statement", "falsifier", "status", "evidenceRefs"], hat, findings);
      if (!/^H[0-9]+$/u.test(String(hypothesis.id ?? ""))) findings.push(`${hat}.id must match HN`);
      else if (hypothesisIds.has(hypothesis.id)) findings.push(`${at} duplicate hypothesis id: ${hypothesis.id}`);
      else hypothesisIds.add(hypothesis.id);
      if (!text(hypothesis.statement)) findings.push(`${hat}.statement is required`);
      if (!text(hypothesis.falsifier)) findings.push(`${hat}.falsifier is required`);
      if (!HYPOTHESIS_STATUSES.has(hypothesis.status)) findings.push(`${hat}.status must be one of: ${accepted(HYPOTHESIS_STATUSES)}`);
      receiptIdArray(hypothesis.evidenceRefs, `${hat}.evidenceRefs`, findings);
    }
    if (!object(bug.rootCause)) findings.push(`${at}.rootCause must be an object`);
    else {
      exactKeys(bug.rootCause, ["status", "statement", "causalChain", "evidenceRefs"], `${at}.rootCause`, findings);
      if (!ROOT_STATUSES.has(bug.rootCause.status)) findings.push(`${at}.rootCause.status must be one of: ${accepted(ROOT_STATUSES)}`);
      if (!nullableText(bug.rootCause.statement)) findings.push(`${at}.rootCause.statement must be a string`);
      stringArray(bug.rootCause.causalChain, `${at}.rootCause.causalChain`, findings);
      receiptIdArray(bug.rootCause.evidenceRefs, `${at}.rootCause.evidenceRefs`, findings);
      if (bug.rootCause.status === "supported" && (!text(bug.rootCause.statement) || bug.rootCause.causalChain.length < 1 || bug.rootCause.evidenceRefs.length < 1)) findings.push(`${at}.rootCause supported requires statement, causalChain, and evidenceRefs`);
    }
    if (!object(bug.fix)) findings.push(`${at}.fix must be an object`);
    else {
      exactKeys(bug.fix, ["status", "firstRevision", "affectedBugIds", "summary"], `${at}.fix`, findings);
      if (!FIX_STATUSES.has(bug.fix.status)) findings.push(`${at}.fix.status must be one of: ${accepted(FIX_STATUSES)}`);
      if (bug.fix.firstRevision !== null && !/^R-[0-9]+$/u.test(String(bug.fix.firstRevision))) findings.push(`${at}.fix.firstRevision must be null or match R-N`);
      stringArray(bug.fix.affectedBugIds, `${at}.fix.affectedBugIds`, findings);
      if (!nullableText(bug.fix.summary)) findings.push(`${at}.fix.summary must be a string`);
    }
    if (!object(bug.verification)) findings.push(`${at}.verification must be an object`);
    else {
      exactKeys(bug.verification, ["originalReproduction", "regression", "debugCleanup"], `${at}.verification`, findings);
      if (bug.verification.originalReproduction !== null) receiptReference(bug.verification.originalReproduction, `${at}.verification.originalReproduction`, findings);
      if (!Array.isArray(bug.verification.regression)) findings.push(`${at}.verification.regression must be an array`);
      else bug.verification.regression.forEach((reference, rIndex) => receiptReference(reference, `${at}.verification.regression[${rIndex}]`, findings));
      if (bug.verification.debugCleanup !== null) receiptReference(bug.verification.debugCleanup, `${at}.verification.debugCleanup`, findings);
    }
    if (!Array.isArray(bug.attempts)) findings.push(`${at}.attempts must be an array`);
    else for (const [aIndex, attempt] of bug.attempts.entries()) {
      const aat = `${at}.attempts[${aIndex}]`;
      if (!object(attempt)) { findings.push(`${aat} must be an object`); continue; }
      exactKeys(attempt, ["id", "revision", "hypothesisId", "changeSummary", "outcome", "evidenceRefs"], aat, findings);
      if (!text(attempt.id, 64)) findings.push(`${aat}.id is required`);
      if (!text(attempt.revision, 128)) findings.push(`${aat}.revision is required`);
      if (!hypothesisIds.has(attempt.hypothesisId)) findings.push(`${aat}.hypothesisId references unknown hypothesis`);
      if (!text(attempt.changeSummary)) findings.push(`${aat}.changeSummary is required`);
      if (!['failed', 'succeeded', 'reverted'].includes(attempt.outcome)) findings.push(`${aat}.outcome is invalid`);
      receiptIdArray(attempt.evidenceRefs, `${aat}.evidenceRefs`, findings);
    }
    stringArray(bug.residualRisks, `${at}.residualRisks`, findings);
  }
  for (const [index, bug] of bugs.entries()) {
    for (const id of Array.isArray(bug.dependsOn) ? bug.dependsOn : []) if (!bugIds.has(id)) findings.push(`bugs[${index}].dependsOn references unknown bug: ${id}`);
    if (bug.duplicateOf && !bugIds.has(bug.duplicateOf)) findings.push(`bugs[${index}].duplicateOf references unknown bug: ${bug.duplicateOf}`);
    for (const id of Array.isArray(bug.fix?.affectedBugIds) ? bug.fix.affectedBugIds : []) if (!bugIds.has(id)) findings.push(`bugs[${index}].fix.affectedBugIds references unknown bug: ${id}`);
  }
  if (raw.activeBugId !== null && !bugIds.has(raw.activeBugId)) findings.push("activeBugId references unknown bug");
  const active = bugs.filter((bug) => ACTIVE_BUG_STATUSES.has(bug.status));
  if (raw.status === "open" && raw.run?.state === "active") {
    if (active.length !== 1 || active[0]?.id !== raw.activeBugId) findings.push("an active work order must have exactly one active bug matching activeBugId");
  } else if (active.length > 0) findings.push("paused, closed, or aborted work orders cannot contain an active bug");
  if (raw.status === "closed" && bugs.some((bug) => !TERMINAL_BUG_STATUSES.has(bug.status))) findings.push("closed work order contains a non-terminal bug");
  if (!object(raw.resume)) findings.push("resume must be an object");
  else {
    exactKeys(raw.resume, ["nextBugId", "nextAction", "recoveryCommands"], "resume", findings);
    if (raw.resume.nextBugId !== null && !bugIds.has(raw.resume.nextBugId)) findings.push("resume.nextBugId references unknown bug");
    if (!text(raw.resume.nextAction)) findings.push("resume.nextAction is required");
    stringArray(raw.resume.recoveryCommands, "resume.recoveryCommands", findings);
  }
  for (const [index, bug] of bugs.entries()) if (["blocked", "deferred", "architecture-review"].includes(bug.status) && raw.resume?.nextBugId === bug.id && !text(raw.resume?.nextAction)) findings.push(`bugs[${index}] requires a resume action`);
  return { valid: findings.length === 0, findings, workOrder: raw };
}

export function loadWorkOrder(path, config) {
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) return { present: true, valid: false, findings: ["work order must be a regular non-symlink file"], path };
    if (info.size > config.ledger.maxBytes) return { present: true, valid: false, findings: [`work order exceeds ${config.ledger.maxBytes} bytes`], path };
    const extracted = extractWorkOrder(readFileSync(path, "utf8"));
    if (!extracted.ok) return { present: true, valid: false, findings: [extracted.error], path };
    return { present: true, path, ...validateWorkOrder(extracted.value, config) };
  } catch (error) {
    return { present: existsSync(path), valid: false, findings: [`cannot read work order: ${error?.message ?? error}`], path };
  }
}

export function isWorkOrderPath(path, repoRoot, config) {
  const rel = relative(resolve(repoRoot), resolve(path)).replaceAll("\\", "/");
  return !rel.startsWith("../") && rel.startsWith(`${config.ledger.root}/`) && rel.endsWith(".md");
}

export function scanWorkOrders(repoRoot, config) {
  const root = join(repoRoot, config.ledger.root);
  let names = [];
  try { names = readdirSync(root).filter((name) => name.endsWith(".md")).sort().slice(0, config.ledger.maxFiles); } catch { return []; }
  return names.map((name) => loadWorkOrder(join(root, name), config)).filter((item) => item.valid && ["open", "paused"].includes(item.workOrder.status));
}
