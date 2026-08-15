// harness-source-hash: sha256:1a18147c713d0d7d0f2809316fa8f97e33c4cf2a584b7833d9efb1f6bf2a8dc5

// plugins/debugging-workflow-guard/src/lib/config.ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
var DEFAULT_CONFIG = Object.freeze({
  mode: "block",
  ledger: Object.freeze({
    root: ".debug-workflow",
    persistence: "local",
    maxFiles: 40,
    maxBytes: 256 * 1024
  }),
  limits: Object.freeze({
    maxBugs: 50,
    maxHypothesesPerBug: 20,
    maxFailedFixAttempts: 3,
    leaseMinutes: 120,
    maxReceipts: 200
  }),
  commands: Object.freeze({
    reproductionPatterns: Object.freeze([]),
    verificationPatterns: Object.freeze([]),
    expectedFailurePatterns: Object.freeze([]),
    expectedSuccessPatterns: Object.freeze([])
  }),
  paths: Object.freeze({
    codePatterns: Object.freeze([]),
    testPatterns: Object.freeze([]),
    diagnosticPatterns: Object.freeze([]),
    nonCodePatterns: Object.freeze([])
  })
});
function cloneDefaults() {
  return {
    mode: DEFAULT_CONFIG.mode,
    ledger: { ...DEFAULT_CONFIG.ledger },
    limits: { ...DEFAULT_CONFIG.limits },
    commands: Object.fromEntries(
      Object.entries(DEFAULT_CONFIG.commands).map(([key, value]) => [key, [...value]])
    ),
    paths: Object.fromEntries(
      Object.entries(DEFAULT_CONFIG.paths).map(([key, value]) => [key, [...value]])
    )
  };
}
function positiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= max ? number : fallback;
}
function strings(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
}
function resolveConfig(raw, warn = () => {
}) {
  const config = cloneDefaults();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return config;
  if (["block", "report", "off"].includes(raw.mode)) config.mode = raw.mode;
  else if (raw.mode !== void 0) warn(`invalid mode: ${raw.mode}`);
  if (raw.ledger && typeof raw.ledger === "object") {
    if (typeof raw.ledger.root === "string" && raw.ledger.root.trim()) {
      const root = raw.ledger.root.trim().replaceAll("\\", "/").replace(/^\.\//u, "");
      if (!root.startsWith("../") && !root.startsWith("/") && !root.split("/").includes("..")) config.ledger.root = root.replace(/\/$/u, "");
      else warn("ledger.root must stay inside the repository");
    }
    if (["local", "tracked"].includes(raw.ledger.persistence)) config.ledger.persistence = raw.ledger.persistence;
    config.ledger.maxFiles = positiveInt(raw.ledger.maxFiles, config.ledger.maxFiles, 200);
    config.ledger.maxBytes = positiveInt(raw.ledger.maxBytes, config.ledger.maxBytes, 1024 * 1024);
  }
  if (raw.limits && typeof raw.limits === "object") {
    config.limits.maxBugs = positiveInt(raw.limits.maxBugs, config.limits.maxBugs, 200);
    config.limits.maxHypothesesPerBug = positiveInt(raw.limits.maxHypothesesPerBug, config.limits.maxHypothesesPerBug, 100);
    config.limits.maxFailedFixAttempts = positiveInt(raw.limits.maxFailedFixAttempts, config.limits.maxFailedFixAttempts, 20);
    config.limits.leaseMinutes = positiveInt(raw.limits.leaseMinutes, config.limits.leaseMinutes, 1440);
    config.limits.maxReceipts = positiveInt(raw.limits.maxReceipts, config.limits.maxReceipts, 1e3);
  }
  for (const group of ["commands", "paths"]) {
    if (!raw[group] || typeof raw[group] !== "object") continue;
    for (const [key, fallback] of Object.entries(config[group])) {
      if (raw[group][key] !== void 0) config[group][key] = strings(raw[group][key], fallback);
    }
  }
  return config;
}
async function loadProjectConfig(repoRoot, warn = () => {
}) {
  if (!repoRoot) return resolveConfig(null, warn);
  for (const name of [".debugging-workflow-guard.mjs", ".debugging-workflow-guard.js", ".debugging-workflow-guard.cjs"]) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const loaded = await import(pathToFileURL(path).href);
      return resolveConfig(loaded.default ?? loaded, warn);
    } catch (error) {
      warn(`failed to load ${name}: ${error?.message ?? error}`);
      return resolveConfig(null, warn);
    }
  }
  return resolveConfig(null, warn);
}

// plugins/debugging-workflow-guard/src/lib/ledger.ts
import { existsSync as existsSync3, lstatSync as lstatSync2, readdirSync as readdirSync2, readFileSync as readFileSync2 } from "node:fs";
import { basename, dirname, join as join3, relative as relative2, resolve as resolve2 } from "node:path";

// plugins/debugging-workflow-guard/src/lib/work-order.ts
import { existsSync as existsSync2, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join as join2, relative, resolve } from "node:path";
var SCHEMA = "debug-work-order/v1";
var WORK_STATUSES = /* @__PURE__ */ new Set(["open", "paused", "closed", "aborted"]);
var RUN_STATES = /* @__PURE__ */ new Set(["active", "paused", "closed"]);
var RUN_MODES = /* @__PURE__ */ new Set(["investigate-only", "investigate-and-fix"]);
var BUG_STATUSES = /* @__PURE__ */ new Set(["queued", "investigating", "fixing", "verifying", "resolved", "blocked", "deferred", "duplicate", "architecture-review"]);
var ACTIVE_BUG_STATUSES = /* @__PURE__ */ new Set(["investigating", "fixing", "verifying"]);
var TERMINAL_BUG_STATUSES = /* @__PURE__ */ new Set(["resolved", "blocked", "deferred", "duplicate", "architecture-review"]);
var HYPOTHESIS_STATUSES = /* @__PURE__ */ new Set(["open", "supported", "falsified"]);
var ROOT_STATUSES = /* @__PURE__ */ new Set(["unknown", "inferred", "supported"]);
var FIX_STATUSES = /* @__PURE__ */ new Set(["not-started", "in-progress", "applied", "reverted"]);
var FENCE = /```json[ \t]+debug-work-order\/v1[ \t]*\r?\n([\s\S]*?)\r?\n```/gu;
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
function text(value, max = 8e3) {
  return typeof value === "string" && value.trim().length > 0 && Buffer.byteLength(value, "utf8") <= max;
}
function nullableText(value, max = 8e3) {
  return value === null || value === "" || text(value, max);
}
function accepted(values) {
  return [...values].join(", ");
}
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
  if (!object(value)) {
    findings.push(`${at} must be a receipt-reference object`);
    return;
  }
  exactKeys(value, ["receiptId"], at, findings);
  if (!/^R-[0-9]+$/u.test(String(value.receiptId ?? ""))) findings.push(`${at}.receiptId must match R-N`);
}
function extractWorkOrder(rawText) {
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
function validateWorkOrder(raw, config) {
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
  const bugIds = /* @__PURE__ */ new Set();
  const bugs = Array.isArray(raw.bugs) ? raw.bugs : [];
  for (const [index, bug] of bugs.entries()) {
    const at = `bugs[${index}]`;
    if (!object(bug)) {
      findings.push(`${at} must be an object`);
      continue;
    }
    exactKeys(bug, ["id", "summary", "goal", "status", "priority", "dependsOn", "duplicateOf", "rootCauseGroup", "symptom", "hypotheses", "rootCause", "fix", "verification", "attempts", "residualRisks"], at, findings);
    if (!/^BUG-[0-9]{3,6}$/u.test(String(bug.id ?? ""))) findings.push(`${at}.id must match BUG-NNN`);
    else if (bugIds.has(bug.id)) findings.push(`duplicate bug id: ${bug.id}`);
    else bugIds.add(bug.id);
    if (!text(bug.summary, 500)) findings.push(`${at}.summary is required`);
    if (!["diagnose", "fix"].includes(bug.goal)) findings.push(`${at}.goal must be diagnose or fix`);
    if (!BUG_STATUSES.has(bug.status)) findings.push(`${at}.status must be one of: ${accepted(BUG_STATUSES)}`);
    if (!["critical", "high", "medium", "low"].includes(bug.priority)) findings.push(`${at}.priority is invalid`);
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
    const hypothesisIds = /* @__PURE__ */ new Set();
    for (const [hIndex, hypothesis] of (Array.isArray(bug.hypotheses) ? bug.hypotheses : []).entries()) {
      const hat = `${at}.hypotheses[${hIndex}]`;
      if (!object(hypothesis)) {
        findings.push(`${hat} must be an object`);
        continue;
      }
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
      if (!object(attempt)) {
        findings.push(`${aat} must be an object`);
        continue;
      }
      exactKeys(attempt, ["id", "revision", "hypothesisId", "changeSummary", "outcome", "evidenceRefs"], aat, findings);
      if (!text(attempt.id, 64)) findings.push(`${aat}.id is required`);
      if (!text(attempt.revision, 128)) findings.push(`${aat}.revision is required`);
      if (!hypothesisIds.has(attempt.hypothesisId)) findings.push(`${aat}.hypothesisId references unknown hypothesis`);
      if (!text(attempt.changeSummary)) findings.push(`${aat}.changeSummary is required`);
      if (!["failed", "succeeded", "reverted"].includes(attempt.outcome)) findings.push(`${aat}.outcome is invalid`);
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
function loadWorkOrder(path, config) {
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) return { present: true, valid: false, findings: ["work order must be a regular non-symlink file"], path };
    if (info.size > config.ledger.maxBytes) return { present: true, valid: false, findings: [`work order exceeds ${config.ledger.maxBytes} bytes`], path };
    const extracted = extractWorkOrder(readFileSync(path, "utf8"));
    if (!extracted.ok) return { present: true, valid: false, findings: [extracted.error], path };
    return { present: true, path, ...validateWorkOrder(extracted.value, config) };
  } catch (error) {
    return { present: existsSync2(path), valid: false, findings: [`cannot read work order: ${error?.message ?? error}`], path };
  }
}
function isWorkOrderPath(path, repoRoot, config) {
  const rel = relative(resolve(repoRoot), resolve(path)).replaceAll("\\", "/");
  if (rel.startsWith("../") || rel === "" || !rel.startsWith(`${config.ledger.root}/`)) return false;
  const rest = rel.slice(config.ledger.root.length + 1);
  if (!rest || rest.startsWith(".state/") || rest === ".state" || rest === ".gitignore") return false;
  const parts = rest.split("/");
  if (parts.length === 1 && rest.endsWith(".md")) return true;
  if (parts.length === 1) {
    try {
      const abs = resolve(path);
      return existsSync2(join2(abs, "intent.json"));
    } catch {
      return false;
    }
  }
  return parts.length === 2 && ["intent.json", "events.jsonl"].includes(parts[1]);
}

// plugins/debugging-workflow-guard/src/lib/ledger.ts
var WRITER_ACTION = "(init|open|resume|activate|claim|affect|pause|close|abort|status|add-bug)";
var WRITER_RE = new RegExp(`debug-workflow\\.(?:mjs|ts)\\s+${WRITER_ACTION}\\b`, "u");
var WRITER_ALIAS_RE = new RegExp(`(?:\\$DWG\\b|debug-workflow)\\s+${WRITER_ACTION}\\b`, "u");
var EVENT_TYPES = /* @__PURE__ */ new Set(["opened", "activate", "claim", "affect", "queued-bug", "pause", "resume", "close", "abort", "architecture-review"]);
var ACTIVE_BUG_STATUSES2 = /* @__PURE__ */ new Set(["investigating", "fixing", "verifying"]);
var TERMINAL_BUG_STATUSES2 = /* @__PURE__ */ new Set(["resolved", "blocked", "deferred", "duplicate", "architecture-review"]);
function object2(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
function text2(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function ledgerRel(path, repoRoot) {
  return relative2(resolve2(repoRoot), resolve2(path)).replaceAll("\\", "/");
}
function canonicalizeLedgerPath(path) {
  const abs = resolve2(path);
  const name = basename(abs);
  if (name === "intent.json" || name === "events.jsonl") return dirname(abs);
  return abs;
}
function isLedgerManagedPath(path, repoRoot, config) {
  const rel = ledgerRel(path, repoRoot);
  if (rel.startsWith("../") || rel === "" || rel === config.ledger.root) return false;
  if (!rel.startsWith(`${config.ledger.root}/`)) return false;
  const rest = rel.slice(config.ledger.root.length + 1);
  return rest !== ".gitignore" && rest !== ".state" && !rest.startsWith(".state/");
}
function isOfficialWriterCommand(command) {
  const text3 = String(command ?? "");
  if (WRITER_RE.test(text3) || WRITER_ALIAS_RE.test(text3)) return true;
  return /\$DWG\b|debug-workflow\.(?:mjs|ts)\b/u.test(text3) && new RegExp(`\\b${WRITER_ACTION}\\b`, "u").test(text3);
}
function writerActionFromCommand(command) {
  const text3 = String(command ?? "");
  return WRITER_RE.exec(text3)?.[1] || WRITER_ALIAS_RE.exec(text3)?.[1] || null;
}
function commandFlag(command, name) {
  const matched = String(command ?? "").match(new RegExp(`--${name}(?:\\s+|=)(?:"([^"]+)"|'([^']+)'|(\\S+))`, "u"));
  return matched?.[1] || matched?.[2] || matched?.[3] || null;
}
function parseWriterStdout(stdout) {
  const lines = String(stdout ?? "").trim().split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]);
      if (object2(value) && (value.id || value.path)) return value;
    } catch {
    }
  }
  return null;
}
function defaultHypotheses(bug) {
  const list = Array.isArray(bug?.hypotheses) ? bug.hypotheses : [];
  return list.map((item, index) => ({
    id: text2(item.id) ? item.id : `H${index + 1}`,
    statement: text2(item.statement) ? item.statement : `hypothesis ${index + 1}`,
    falsifier: text2(item.falsifier) ? item.falsifier : `observation that would reject H${index + 1}`,
    status: "open",
    evidenceRefs: []
  }));
}
function emptyFix() {
  return { status: "not-started", firstRevision: null, affectedBugIds: [], summary: "" };
}
function emptyRootCause() {
  return { status: "unknown", statement: "", causalChain: [], evidenceRefs: [] };
}
function emptyVerification() {
  return { originalReproduction: null, regression: [], debugCleanup: null };
}
function foldWorkOrder({ intent, events = [] }) {
  if (!object2(intent) || !Array.isArray(intent.bugs) || intent.bugs.length < 1) return null;
  let status = "open";
  let runState = "active";
  let epoch = Number(intent.run?.epoch) > 0 ? Number(intent.run.epoch) : 1;
  let mode = intent.run?.mode === "investigate-only" ? "investigate-only" : "investigate-and-fix";
  let activeBugId = intent.bugs[0].id;
  const extraBugs = [];
  const bugStatus = {};
  const hypothesisState = {};
  const rootCauseState = {};
  const affectState = {};
  let resume = {
    nextBugId: activeBugId,
    nextAction: "run the exact reproduction and observe the failure",
    recoveryCommands: []
  };
  for (const event of events) {
    if (!object2(event) || !EVENT_TYPES.has(event.t)) continue;
    if (event.t === "opened") {
      status = "open";
      runState = "active";
      if (Number.isSafeInteger(event.epoch) && event.epoch > 0) epoch = event.epoch;
      if (event.mode === "investigate-only" || event.mode === "investigate-and-fix") mode = event.mode;
    } else if (event.t === "activate" && text2(event.bugId)) {
      status = "open";
      runState = "active";
      activeBugId = event.bugId;
      for (const id of Object.keys(bugStatus)) if (ACTIVE_BUG_STATUSES2.has(bugStatus[id])) bugStatus[id] = "queued";
      bugStatus[event.bugId] = "investigating";
      resume.nextBugId = event.bugId;
    } else if (event.t === "claim" && event.kind === "hypothesis" && text2(event.hypothesisId)) {
      const bugId = event.bugId || activeBugId;
      hypothesisState[`${bugId}:${event.hypothesisId}`] = {
        status: ["supported", "falsified", "open"].includes(event.status) ? event.status : "open",
        evidenceRefs: Array.isArray(event.receiptIds) ? event.receiptIds.filter((id) => /^R-[0-9]+$/u.test(String(id))) : []
      };
    } else if (event.t === "claim" && event.kind === "root-cause") {
      const bugId = event.bugId || activeBugId;
      const refs = Array.isArray(event.receiptIds) ? event.receiptIds.filter((id) => /^R-[0-9]+$/u.test(String(id))) : [];
      rootCauseState[bugId] = {
        status: refs.length > 0 && text2(event.statement) ? "supported" : "inferred",
        statement: text2(event.statement) ? event.statement : "",
        causalChain: Array.isArray(event.causalChain) ? event.causalChain.filter((item) => text2(item)) : [],
        evidenceRefs: refs
      };
    } else if (event.t === "affect" && Array.isArray(event.affectedBugIds)) {
      affectState[event.bugId || activeBugId] = event.affectedBugIds.filter((id) => text2(id));
    } else if (event.t === "queued-bug" && object2(event.bug) && text2(event.bug.id)) {
      extraBugs.push(event.bug);
      bugStatus[event.bug.id] = "queued";
    } else if (event.t === "pause") {
      status = "paused";
      runState = "paused";
      resume = {
        nextBugId: text2(event.nextBugId) ? event.nextBugId : activeBugId,
        nextAction: text2(event.nextAction) ? event.nextAction : "resume the next concrete debug action",
        recoveryCommands: Array.isArray(event.recoveryCommands) ? event.recoveryCommands.filter((item) => text2(item)) : []
      };
      if (event.architectureReview && activeBugId) bugStatus[activeBugId] = "architecture-review";
      else if (activeBugId && !TERMINAL_BUG_STATUSES2.has(bugStatus[activeBugId])) bugStatus[activeBugId] = text2(event.bugStatus) ? event.bugStatus : "blocked";
      activeBugId = null;
    } else if (event.t === "resume") {
      status = "open";
      runState = "active";
      if (Number.isSafeInteger(event.epoch) && event.epoch > 0) epoch = event.epoch;
      else epoch += 1;
      activeBugId = text2(event.bugId) ? event.bugId : resume.nextBugId;
      if (activeBugId) bugStatus[activeBugId] = "investigating";
    } else if (event.t === "close") {
      status = "closed";
      runState = "closed";
      activeBugId = null;
    } else if (event.t === "abort") {
      status = "aborted";
      runState = "closed";
      activeBugId = null;
    } else if (event.t === "architecture-review" && text2(event.bugId)) {
      bugStatus[event.bugId] = "architecture-review";
    }
  }
  const bugs = [...intent.bugs, ...extraBugs].map((raw) => {
    const hypotheses = defaultHypotheses(raw);
    for (const hypothesis of hypotheses) {
      const claimed = hypothesisState[`${raw.id}:${hypothesis.id}`];
      if (claimed) Object.assign(hypothesis, claimed);
    }
    let derived = bugStatus[raw.id] || (raw.id === (status === "open" ? activeBugId : null) ? "investigating" : "queued");
    if ((status === "paused" || status === "closed" || status === "aborted") && ACTIVE_BUG_STATUSES2.has(derived)) {
      derived = status === "closed" ? "deferred" : "blocked";
    }
    return {
      id: raw.id,
      summary: raw.summary,
      goal: raw.goal === "diagnose" ? "diagnose" : "fix",
      status: derived,
      priority: raw.priority || "high",
      dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn : [],
      duplicateOf: raw.duplicateOf ?? null,
      rootCauseGroup: raw.rootCauseGroup ?? null,
      symptom: raw.symptom,
      hypotheses,
      rootCause: rootCauseState[raw.id] || emptyRootCause(),
      fix: { ...emptyFix(), affectedBugIds: affectState[raw.id] || [] },
      verification: emptyVerification(),
      attempts: [],
      residualRisks: []
    };
  });
  return {
    schema: "debug-work-order/v1",
    id: intent.id,
    status,
    run: { epoch, state: runState, mode },
    activeBugId,
    bugs,
    resume
  };
}
function readEventLog(dir) {
  const path = join3(dir, "events.jsonl");
  if (!existsSync3(path)) return [];
  const events = [];
  for (const line of readFileSync2(path, "utf8").split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (object2(value)) events.push(value);
    } catch {
      return { error: "events.jsonl contains an invalid JSON line" };
    }
  }
  return events;
}
function loadIntentFile(dir) {
  const path = join3(dir, "intent.json");
  try {
    const value = JSON.parse(readFileSync2(path, "utf8"));
    return object2(value) ? { ok: true, value } : { ok: false, error: "intent.json must be an object" };
  } catch (error) {
    return { ok: false, error: `cannot read intent.json: ${error?.message ?? error}` };
  }
}
function loadDirectoryLedger(dir, config) {
  try {
    const info = lstatSync2(dir);
    if (!info.isDirectory() || info.isSymbolicLink()) return { present: true, valid: false, findings: ["ledger must be a regular directory"], path: dir, store: "events" };
  } catch (error) {
    return { present: false, valid: false, findings: [`cannot read ledger: ${error?.message ?? error}`], path: dir, store: "events" };
  }
  const intentFile = loadIntentFile(dir);
  if (!intentFile.ok) return { present: true, valid: false, findings: [intentFile.error], path: dir, store: "events" };
  const events = readEventLog(dir);
  if (events?.error) return { present: true, valid: false, findings: [events.error], path: dir, store: "events" };
  const size = Buffer.byteLength(JSON.stringify(intentFile.value), "utf8") + (existsSync3(join3(dir, "events.jsonl")) ? lstatSync2(join3(dir, "events.jsonl")).size : 0);
  if (size > config.ledger.maxBytes) return { present: true, valid: false, findings: [`work order exceeds ${config.ledger.maxBytes} bytes`], path: dir, store: "events" };
  const workOrder = foldWorkOrder({ intent: intentFile.value, events });
  if (!workOrder) return { present: true, valid: false, findings: ["intent.json is missing bugs"], path: dir, store: "events" };
  if (!/^DWO-[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(workOrder.id)) return { present: true, valid: false, findings: ["id must match DWO-<stable-id>"], path: dir, store: "events" };
  return { present: true, valid: true, findings: [], path: dir, workOrder, store: "events", intent: intentFile.value, events };
}
function loadLedger(path, config) {
  if (!path) return { present: false, valid: false, findings: ["ledger path is missing"], path: null, workOrder: null, store: null };
  const abs = resolve2(path);
  if (existsSync3(abs) && lstatSync2(abs).isDirectory()) return loadDirectoryLedger(abs, config);
  const name = basename(abs);
  if (name === "intent.json" || name === "events.jsonl") return loadDirectoryLedger(dirname(abs), config);
  if (name.endsWith(".md")) {
    const loaded = loadWorkOrder(abs, config);
    return { ...loaded, store: loaded.present ? "markdown" : null };
  }
  return { present: existsSync3(abs), valid: false, findings: ["unsupported ledger path"], path: abs, workOrder: null, store: null };
}
function findLedgerDir(repoRoot, config, id) {
  const root = join3(repoRoot, config.ledger.root);
  let names = [];
  try {
    names = readdirSync2(root);
  } catch {
    return null;
  }
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const dir = join3(root, name);
    try {
      if (!lstatSync2(dir).isDirectory() || !existsSync3(join3(dir, "intent.json"))) continue;
    } catch {
      continue;
    }
    const loaded = loadDirectoryLedger(dir, config);
    if (loaded.valid && loaded.workOrder.id === id) return dir;
  }
  return null;
}
function scanLedgers(repoRoot, config) {
  const root = join3(repoRoot, config.ledger.root);
  let names = [];
  try {
    names = readdirSync2(root).sort();
  } catch {
    return [];
  }
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const dir = join3(root, name);
    try {
      if (!lstatSync2(dir).isDirectory() || !existsSync3(join3(dir, "intent.json"))) continue;
    } catch {
      continue;
    }
    const loaded = loadDirectoryLedger(dir, config);
    if (loaded.valid && ["open", "paused"].includes(loaded.workOrder.status) && !seen.has(loaded.workOrder.id)) {
      found.push(loaded);
      seen.add(loaded.workOrder.id);
    }
    if (found.length >= config.ledger.maxFiles) return found;
  }
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const loaded = loadWorkOrder(join3(root, name), config);
    if (loaded.valid && ["open", "paused"].includes(loaded.workOrder.status) && !seen.has(loaded.workOrder.id)) {
      found.push({ ...loaded, store: "markdown" });
      seen.add(loaded.workOrder.id);
    }
    if (found.length >= config.ledger.maxFiles) break;
  }
  return found;
}
function describeLedger(item, repoRoot) {
  const rel = ledgerRel(item.path, repoRoot);
  const order = item.workOrder;
  return `- ${rel} \u2014 ${order.id} (${order.status}, epoch ${order.run.epoch}, active ${order.activeBugId ?? "none"}; next: ${order.resume?.nextAction ?? "n/a"})`;
}

// core/src/plugin-workdir.ts
import { mkdirSync, readFileSync as readFileSync3, writeFileSync } from "node:fs";
import { join as join4 } from "node:path";
var PLUGIN_WORKDIR_GITIGNORE = "*\n";
function normalizeGitignore(text3) {
  return String(text3 ?? "").replace(/\r\n/gu, "\n").trim();
}
function isStalePluginWorkdirGitignore(text3) {
  const value = normalizeGitignore(text3);
  return value === "" || value === "state/" || value === "sessions/";
}
function ensurePluginWorkdirGitignore(pluginRoot) {
  mkdirSync(pluginRoot, { recursive: true, mode: 448 });
  const ignore = join4(pluginRoot, ".gitignore");
  let current = null;
  try {
    current = readFileSync3(ignore, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current !== null && normalizeGitignore(current) === "*") return;
  if (current !== null && !isStalePluginWorkdirGitignore(current)) return;
  writeFileSync(ignore, PLUGIN_WORKDIR_GITIGNORE, { encoding: "utf8", mode: 384 });
}

export {
  ensurePluginWorkdirGitignore,
  DEFAULT_CONFIG,
  loadProjectConfig,
  isWorkOrderPath,
  canonicalizeLedgerPath,
  isLedgerManagedPath,
  isOfficialWriterCommand,
  writerActionFromCommand,
  commandFlag,
  parseWriterStdout,
  loadLedger,
  findLedgerDir,
  scanLedgers,
  describeLedger
};
