import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { isRecord } from "@harness/core/hook-event";

import type { PluginConfig } from "./config.js";

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

export type Symptom = {
  expected?: unknown;
  actual?: unknown;
  reproduction?: unknown;
  environment?: unknown;
  [key: string]: unknown;
};

export type BugFix = {
  status?: unknown;
  firstRevision?: unknown;
  affectedBugIds?: unknown;
  summary?: unknown;
  [key: string]: unknown;
};

export type Bug = {
  id?: unknown;
  summary?: unknown;
  goal?: unknown;
  status?: unknown;
  priority?: unknown;
  dependsOn?: unknown;
  duplicateOf?: unknown;
  rootCauseGroup?: unknown;
  symptom?: Symptom | unknown;
  hypotheses?: unknown;
  rootCause?: unknown;
  fix?: BugFix | undefined;
  verification?: unknown;
  attempts?: unknown;
  residualRisks?: unknown;
  [key: string]: unknown;
};

export type WorkOrderRun = {
  epoch?: unknown;
  state?: unknown;
  mode?: unknown;
  [key: string]: unknown;
};

export type WorkOrderResume = {
  nextBugId?: unknown;
  nextAction?: unknown;
  recoveryCommands?: unknown;
  [key: string]: unknown;
};

export type WorkOrder = {
  schema?: unknown;
  id?: unknown;
  status?: unknown;
  run?: WorkOrderRun | undefined;
  activeBugId?: unknown;
  bugs: Bug[];
  resume?: WorkOrderResume | undefined;
  [key: string]: unknown;
};

export type ExtractWorkOrderResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

export type ValidateWorkOrderResult =
  | { valid: true; findings: string[]; workOrder: WorkOrder }
  | { valid: false; findings: string[]; workOrder: WorkOrder | null };

export type LoadWorkOrderResult =
  | { present: boolean; valid: false; findings: string[]; path: string; workOrder?: WorkOrder | null }
  | { present: true; valid: true; findings: string[]; path: string; workOrder: WorkOrder };

function object(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function text(value: unknown, max = 8000): value is string {
  return typeof value === "string" && value.trim().length > 0 && Buffer.byteLength(value, "utf8") <= max;
}

function nullableText(value: unknown, max = 8000): boolean {
  return value === null || value === "" || text(value, max);
}

function accepted(values: Set<string>): string {
  return [...values].join(", ");
}

function setHas(set: Set<string>, value: unknown): boolean {
  return typeof value === "string" && set.has(value);
}

function exactKeys(value: unknown, allowed: string[], at: string, findings: string[]): void {
  if (!object(value)) return;
  for (const key of Object.keys(value)) if (!allowed.includes(key)) findings.push(`${at} contains unknown field: ${key}`);
}

function stringArray(value: unknown, at: string, findings: string[]): void {
  if (!Array.isArray(value) || value.some((item) => !text(item, 500))) findings.push(`${at} must be an array of non-empty strings`);
}

function receiptIdArray(value: unknown, at: string, findings: string[]): void {
  if (!Array.isArray(value) || value.some((item) => !/^R-[0-9]+$/u.test(String(item)))) findings.push(`${at} must be an array of R-N receipt ids`);
}

function receiptReference(value: unknown, at: string, findings: string[]): void {
  if (!object(value)) { findings.push(`${at} must be a receipt-reference object`); return; }
  exactKeys(value, ["receiptId"], at, findings);
  if (!/^R-[0-9]+$/u.test(String(value.receiptId ?? ""))) findings.push(`${at}.receiptId must match R-N`);
}

function asBug(value: unknown): Bug {
  if (!object(value)) return { id: value };
  const bug: Bug = { ...value };
  if (object(value.symptom)) bug.symptom = value.symptom;
  if (object(value.fix)) bug.fix = value.fix;
  return bug;
}

function asWorkOrder(raw: Record<string, unknown>): WorkOrder {
  const bugs = Array.isArray(raw.bugs) ? raw.bugs.map((item) => asBug(item)) : [];
  const workOrder: WorkOrder = {
    ...raw,
    bugs,
  };
  if (object(raw.run)) workOrder.run = raw.run;
  if (object(raw.resume)) workOrder.resume = raw.resume;
  return workOrder;
}

function collectionLength(value: unknown): number {
  if (value === undefined || value === null) {
    throw new TypeError(`Cannot read properties of ${String(value)} (reading 'length')`);
  }
  if (Array.isArray(value) || typeof value === "string") return value.length;
  if (typeof value === "object" && "length" in value) return Number(value.length);
  return Number(undefined);
}

function runStateForStatus(status: unknown): string | undefined {
  if (status === "open") return "active";
  if (status === "paused") return "paused";
  if (status === "closed" || status === "aborted") return "closed";
  return undefined;
}

export function extractWorkOrder(rawText: unknown): ExtractWorkOrderResult {
  const textValue = String(rawText ?? "");
  const matches = [...textValue.matchAll(FENCE)];
  if (matches.length !== 1) return { ok: false, error: `expected exactly one json debug-work-order/v1 block; found ${matches.length}` };
  try {
    const body = matches[0]?.[1] ?? "";
    const value: unknown = JSON.parse(body);
    return object(value) ? { ok: true, value } : { ok: false, error: "work order root must be an object" };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : error;
    return { ok: false, error: `work order JSON parse failed: ${message ?? error}` };
  }
}

export function validateWorkOrder(raw: unknown, config?: PluginConfig | null): ValidateWorkOrderResult {
  const findings: string[] = [];
  if (!object(raw)) return { valid: false, findings: ["work order root must be an object"], workOrder: null };
  exactKeys(raw, ["schema", "id", "status", "run", "activeBugId", "bugs", "resume"], "work order", findings);
  if (raw.schema !== SCHEMA) findings.push(`schema must be ${SCHEMA}`);
  if (!/^DWO-[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(String(raw.id ?? ""))) findings.push("id must match DWO-<stable-id>");
  if (!setHas(WORK_STATUSES, raw.status)) findings.push("status is invalid");

  if (!object(raw.run)) findings.push("run must be an object");
  else {
    exactKeys(raw.run, ["epoch", "state", "mode"], "run", findings);
    if (!Number.isSafeInteger(raw.run.epoch) || Number(raw.run.epoch) < 1) findings.push("run.epoch must be a positive integer");
    if (!setHas(RUN_STATES, raw.run.state)) findings.push(`run.state must be one of: ${accepted(RUN_STATES)}`);
    if (!setHas(RUN_MODES, raw.run.mode)) findings.push(`run.mode must be one of: ${accepted(RUN_MODES)}`);
  }
  const alignedRunState = runStateForStatus(raw.status);
  const observedRunState = object(raw.run) ? raw.run.state : undefined;
  if (alignedRunState && observedRunState !== alignedRunState) findings.push(`status ${String(raw.status)} requires run.state ${alignedRunState}`);

  const maxBugs = config?.limits?.maxBugs ?? 50;
  const maxHypotheses = config?.limits?.maxHypothesesPerBug ?? 20;
  if (!Array.isArray(raw.bugs) || raw.bugs.length < 1 || raw.bugs.length > maxBugs) findings.push(`bugs must contain 1..${maxBugs} items`);
  const bugIds = new Set<unknown>();
  const bugs = Array.isArray(raw.bugs) ? raw.bugs : [];
  for (const [index, bugValue] of bugs.entries()) {
    const at = `bugs[${index}]`;
    if (!object(bugValue)) { findings.push(`${at} must be an object`); continue; }
    const bug = bugValue;
    exactKeys(bug, ["id", "summary", "goal", "status", "priority", "dependsOn", "duplicateOf", "rootCauseGroup", "symptom", "hypotheses", "rootCause", "fix", "verification", "attempts", "residualRisks"], at, findings);
    if (!/^BUG-[0-9]{3,6}$/u.test(String(bug.id ?? ""))) findings.push(`${at}.id must match BUG-NNN`);
    else if (bugIds.has(bug.id)) findings.push(`duplicate bug id: ${String(bug.id)}`);
    else bugIds.add(bug.id);
    if (!text(bug.summary, 500)) findings.push(`${at}.summary is required`);
    if (bug.goal !== "diagnose" && bug.goal !== "fix") findings.push(`${at}.goal must be diagnose or fix`);
    if (!setHas(BUG_STATUSES, bug.status)) findings.push(`${at}.status must be one of: ${accepted(BUG_STATUSES)}`);
    if (bug.priority !== "critical" && bug.priority !== "high" && bug.priority !== "medium" && bug.priority !== "low") findings.push(`${at}.priority is invalid`);
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
    const hypothesisIds = new Set<unknown>();
    for (const [hIndex, hypothesisValue] of (Array.isArray(bug.hypotheses) ? bug.hypotheses : []).entries()) {
      const hat = `${at}.hypotheses[${hIndex}]`;
      if (!object(hypothesisValue)) { findings.push(`${hat} must be an object`); continue; }
      const hypothesis = hypothesisValue;
      exactKeys(hypothesis, ["id", "statement", "falsifier", "status", "evidenceRefs"], hat, findings);
      if (!/^H[0-9]+$/u.test(String(hypothesis.id ?? ""))) findings.push(`${hat}.id must match HN`);
      else if (hypothesisIds.has(hypothesis.id)) findings.push(`${at} duplicate hypothesis id: ${String(hypothesis.id)}`);
      else hypothesisIds.add(hypothesis.id);
      if (!text(hypothesis.statement)) findings.push(`${hat}.statement is required`);
      if (!text(hypothesis.falsifier)) findings.push(`${hat}.falsifier is required`);
      if (!setHas(HYPOTHESIS_STATUSES, hypothesis.status)) findings.push(`${hat}.status must be one of: ${accepted(HYPOTHESIS_STATUSES)}`);
      receiptIdArray(hypothesis.evidenceRefs, `${hat}.evidenceRefs`, findings);
    }
    if (!object(bug.rootCause)) findings.push(`${at}.rootCause must be an object`);
    else {
      exactKeys(bug.rootCause, ["status", "statement", "causalChain", "evidenceRefs"], `${at}.rootCause`, findings);
      if (!setHas(ROOT_STATUSES, bug.rootCause.status)) findings.push(`${at}.rootCause.status must be one of: ${accepted(ROOT_STATUSES)}`);
      if (!nullableText(bug.rootCause.statement)) findings.push(`${at}.rootCause.statement must be a string`);
      stringArray(bug.rootCause.causalChain, `${at}.rootCause.causalChain`, findings);
      receiptIdArray(bug.rootCause.evidenceRefs, `${at}.rootCause.evidenceRefs`, findings);
      if (bug.rootCause.status === "supported" && (!text(bug.rootCause.statement) || collectionLength(bug.rootCause.causalChain) < 1 || collectionLength(bug.rootCause.evidenceRefs) < 1)) findings.push(`${at}.rootCause supported requires statement, causalChain, and evidenceRefs`);
    }
    if (!object(bug.fix)) findings.push(`${at}.fix must be an object`);
    else {
      exactKeys(bug.fix, ["status", "firstRevision", "affectedBugIds", "summary"], `${at}.fix`, findings);
      if (!setHas(FIX_STATUSES, bug.fix.status)) findings.push(`${at}.fix.status must be one of: ${accepted(FIX_STATUSES)}`);
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
    else for (const [aIndex, attemptValue] of bug.attempts.entries()) {
      const aat = `${at}.attempts[${aIndex}]`;
      if (!object(attemptValue)) { findings.push(`${aat} must be an object`); continue; }
      const attempt = attemptValue;
      exactKeys(attempt, ["id", "revision", "hypothesisId", "changeSummary", "outcome", "evidenceRefs"], aat, findings);
      if (!text(attempt.id, 64)) findings.push(`${aat}.id is required`);
      if (!text(attempt.revision, 128)) findings.push(`${aat}.revision is required`);
      if (!hypothesisIds.has(attempt.hypothesisId)) findings.push(`${aat}.hypothesisId references unknown hypothesis`);
      if (!text(attempt.changeSummary)) findings.push(`${aat}.changeSummary is required`);
      if (attempt.outcome !== "failed" && attempt.outcome !== "succeeded" && attempt.outcome !== "reverted") findings.push(`${aat}.outcome is invalid`);
      receiptIdArray(attempt.evidenceRefs, `${aat}.evidenceRefs`, findings);
    }
    stringArray(bug.residualRisks, `${at}.residualRisks`, findings);
  }
  for (const [index, bugValue] of bugs.entries()) {
    const bug = object(bugValue) ? bugValue : {};
    for (const id of Array.isArray(bug.dependsOn) ? bug.dependsOn : []) if (!bugIds.has(id)) findings.push(`bugs[${index}].dependsOn references unknown bug: ${String(id)}`);
    if (bug.duplicateOf && !bugIds.has(bug.duplicateOf)) findings.push(`bugs[${index}].duplicateOf references unknown bug: ${String(bug.duplicateOf)}`);
    const fix = object(bug.fix) ? bug.fix : undefined;
    for (const id of Array.isArray(fix?.affectedBugIds) ? fix.affectedBugIds : []) if (!bugIds.has(id)) findings.push(`bugs[${index}].fix.affectedBugIds references unknown bug: ${String(id)}`);
  }
  if (raw.activeBugId !== null && !bugIds.has(raw.activeBugId)) findings.push("activeBugId references unknown bug");
  const typedBugs = bugs.map((bug) => asBug(bug));
  const active = typedBugs.filter((bug) => setHas(ACTIVE_BUG_STATUSES, bug.status));
  const run = object(raw.run) ? raw.run : undefined;
  if (raw.status === "open" && run?.state === "active") {
    const activeBug = active[0];
    if (active.length !== 1 || activeBug?.id !== raw.activeBugId) findings.push("an active work order must have exactly one active bug matching activeBugId");
  } else if (active.length > 0) findings.push("paused, closed, or aborted work orders cannot contain an active bug");
  if (raw.status === "closed" && typedBugs.some((bug) => !setHas(TERMINAL_BUG_STATUSES, bug.status))) findings.push("closed work order contains a non-terminal bug");
  if (!object(raw.resume)) findings.push("resume must be an object");
  else {
    exactKeys(raw.resume, ["nextBugId", "nextAction", "recoveryCommands"], "resume", findings);
    if (raw.resume.nextBugId !== null && !bugIds.has(raw.resume.nextBugId)) findings.push("resume.nextBugId references unknown bug");
    if (!text(raw.resume.nextAction)) findings.push("resume.nextAction is required");
    stringArray(raw.resume.recoveryCommands, "resume.recoveryCommands", findings);
  }
  const resume = object(raw.resume) ? raw.resume : undefined;
  for (const [index, bug] of typedBugs.entries()) if (["blocked", "deferred", "architecture-review"].includes(String(bug.status)) && resume?.nextBugId === bug.id && !text(resume?.nextAction)) findings.push(`bugs[${index}] requires a resume action`);
  const workOrder = asWorkOrder(raw);
  return findings.length === 0
    ? { valid: true, findings, workOrder }
    : { valid: false, findings, workOrder };
}

export function loadWorkOrder(path: string, config: PluginConfig): LoadWorkOrderResult {
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) return { present: true, valid: false, findings: ["work order must be a regular non-symlink file"], path };
    if (info.size > config.ledger.maxBytes) return { present: true, valid: false, findings: [`work order exceeds ${config.ledger.maxBytes} bytes`], path };
    const extracted = extractWorkOrder(readFileSync(path, "utf8"));
    if (!extracted.ok) return { present: true, valid: false, findings: [extracted.error], path };
    return { present: true, path, ...validateWorkOrder(extracted.value, config) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : error;
    return { present: existsSync(path), valid: false, findings: [`cannot read work order: ${message ?? error}`], path };
  }
}

export function isWorkOrderPath(path: string, repoRoot: string, config: PluginConfig): boolean {
  const rel = relative(resolve(repoRoot), resolve(path)).replaceAll("\\", "/");
  if (rel.startsWith("../") || rel === "" || !rel.startsWith(`${config.ledger.root}/`)) return false;
  const rest = rel.slice(config.ledger.root.length + 1);
  if (!rest || rest.startsWith(".state/") || rest === ".state" || rest === ".gitignore") return false;
  const parts = rest.split("/");
  if (parts.length === 1 && rest.endsWith(".md")) return true;
  if (parts.length === 1) {
    try {
      const abs = resolve(path);
      return existsSync(join(abs, "intent.json"));
    } catch { return false; }
  }
  const leaf = parts[1];
  return parts.length === 2 && (leaf === "intent.json" || leaf === "events.jsonl");
}

export function scanWorkOrders(repoRoot: string, config: PluginConfig): LoadWorkOrderResult[] {
  const root = join(repoRoot, config.ledger.root);
  let names: string[] = [];
  try { names = readdirSync(root).filter((name) => name.endsWith(".md")).sort().slice(0, config.ledger.maxFiles); } catch { return []; }
  return names.map((name) => loadWorkOrder(join(root, name), config)).filter((item) => item.valid && (item.workOrder.status === "open" || item.workOrder.status === "paused"));
}
