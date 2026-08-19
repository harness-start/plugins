// harness-source-hash: sha256:8603e9d0f835f01cba1e98e871419348513953fcfa810a4a257a0cf7d3a9a790

// core/src/hook-event.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}
function nestedRecord(event, key) {
  const value = event[key];
  return isRecord(value) ? value : null;
}
async function readStdinJson(input = process.stdin) {
  let raw = "";
  for await (const chunk of input) raw += chunk.toString();
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : { __parseError: true };
  } catch {
    return { __parseError: true };
  }
}
function eventSessionId(event) {
  const context = nestedRecord(event, "context");
  return firstString(
    event.session_id,
    event.sessionId,
    event.sessionID,
    event.conversation_id,
    event.conversationId,
    context?.session_id
  );
}
function eventCwd(event) {
  return firstString(event.cwd, event.working_directory, event.workingDirectory) || process.cwd();
}
function eventToolName(event) {
  const tool = nestedRecord(event, "tool");
  return firstString(event.tool_name, event.toolName, tool?.name);
}
function eventToolInput(event) {
  const tool = nestedRecord(event, "tool");
  const value = event.tool_input ?? event.toolInput ?? tool?.input ?? event.input;
  return isRecord(value) ? value : {};
}
function eventToolResponse(event) {
  const tool = nestedRecord(event, "tool");
  return event.tool_response ?? event.toolResponse ?? event.tool_result ?? event.toolResult ?? event.response ?? tool?.response ?? null;
}
function eventAssistantMessage(event) {
  return firstString(
    event.last_assistant_message,
    event.lastAssistantMessage,
    event.assistant_message,
    event.assistant_text,
    event.assistantText
  );
}

// plugins/software-debugging/src/lib/config.ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
var defaultConfig = {
  mode: "block",
  ledger: {
    root: ".debug-workflow",
    persistence: "local",
    maxFiles: 40,
    maxBytes: 256 * 1024
  },
  limits: {
    maxBugs: 50,
    maxHypothesesPerBug: 20,
    maxFailedFixAttempts: 3,
    leaseMinutes: 120,
    maxReceipts: 200
  },
  commands: {
    reproductionPatterns: [],
    verificationPatterns: [],
    expectedFailurePatterns: [],
    expectedSuccessPatterns: []
  },
  paths: {
    codePatterns: [],
    testPatterns: [],
    diagnosticPatterns: [],
    nonCodePatterns: []
  }
};
Object.freeze(defaultConfig);
Object.freeze(defaultConfig.ledger);
Object.freeze(defaultConfig.limits);
Object.freeze(defaultConfig.commands);
Object.freeze(defaultConfig.paths);
Object.freeze(defaultConfig.commands.reproductionPatterns);
Object.freeze(defaultConfig.commands.verificationPatterns);
Object.freeze(defaultConfig.commands.expectedFailurePatterns);
Object.freeze(defaultConfig.commands.expectedSuccessPatterns);
Object.freeze(defaultConfig.paths.codePatterns);
Object.freeze(defaultConfig.paths.testPatterns);
Object.freeze(defaultConfig.paths.diagnosticPatterns);
Object.freeze(defaultConfig.paths.nonCodePatterns);
var DEFAULT_CONFIG = defaultConfig;
function cloneDefaults() {
  return {
    mode: DEFAULT_CONFIG.mode,
    ledger: { ...DEFAULT_CONFIG.ledger },
    limits: { ...DEFAULT_CONFIG.limits },
    commands: {
      reproductionPatterns: [...DEFAULT_CONFIG.commands.reproductionPatterns],
      verificationPatterns: [...DEFAULT_CONFIG.commands.verificationPatterns],
      expectedFailurePatterns: [...DEFAULT_CONFIG.commands.expectedFailurePatterns],
      expectedSuccessPatterns: [...DEFAULT_CONFIG.commands.expectedSuccessPatterns]
    },
    paths: {
      codePatterns: [...DEFAULT_CONFIG.paths.codePatterns],
      testPatterns: [...DEFAULT_CONFIG.paths.testPatterns],
      diagnosticPatterns: [...DEFAULT_CONFIG.paths.diagnosticPatterns],
      nonCodePatterns: [...DEFAULT_CONFIG.paths.nonCodePatterns]
    }
  };
}
function positiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= max ? number : fallback;
}
function strings(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item) => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}
function isConfigMode(value) {
  return value === "block" || value === "report" || value === "off";
}
function isLedgerPersistence(value) {
  return value === "local" || value === "tracked";
}
function applyPatternGroup(target, source) {
  if (!isRecord(source)) return;
  for (const [key, fallback] of Object.entries(target)) {
    if (source[key] !== void 0) target[key] = strings(source[key], fallback);
  }
}
function resolveConfig(raw, warn = () => {
}) {
  const config = cloneDefaults();
  if (!isRecord(raw)) return config;
  if (isConfigMode(raw.mode)) config.mode = raw.mode;
  else if (raw.mode !== void 0) warn(`invalid mode: ${String(raw.mode)}`);
  if (isRecord(raw.ledger)) {
    if (typeof raw.ledger.root === "string" && raw.ledger.root.trim()) {
      const root = raw.ledger.root.trim().replaceAll("\\", "/").replace(/^\.\//u, "");
      if (!root.startsWith("../") && !root.startsWith("/") && !root.split("/").includes("..")) config.ledger.root = root.replace(/\/$/u, "");
      else warn("ledger.root must stay inside the repository");
    }
    if (isLedgerPersistence(raw.ledger.persistence)) config.ledger.persistence = raw.ledger.persistence;
    config.ledger.maxFiles = positiveInt(raw.ledger.maxFiles, config.ledger.maxFiles, 200);
    config.ledger.maxBytes = positiveInt(raw.ledger.maxBytes, config.ledger.maxBytes, 1024 * 1024);
  }
  if (isRecord(raw.limits)) {
    config.limits.maxBugs = positiveInt(raw.limits.maxBugs, config.limits.maxBugs, 200);
    config.limits.maxHypothesesPerBug = positiveInt(raw.limits.maxHypothesesPerBug, config.limits.maxHypothesesPerBug, 100);
    config.limits.maxFailedFixAttempts = positiveInt(raw.limits.maxFailedFixAttempts, config.limits.maxFailedFixAttempts, 20);
    config.limits.leaseMinutes = positiveInt(raw.limits.leaseMinutes, config.limits.leaseMinutes, 1440);
    config.limits.maxReceipts = positiveInt(raw.limits.maxReceipts, config.limits.maxReceipts, 1e3);
  }
  applyPatternGroup(config.commands, raw.commands);
  applyPatternGroup(config.paths, raw.paths);
  return config;
}
async function loadProjectConfig(repoRoot, warn = () => {
}) {
  if (!repoRoot) return resolveConfig(null, warn);
  for (const name of [".software-debugging.mjs", ".software-debugging.js", ".software-debugging.cjs"]) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const loaded = await import(pathToFileURL(path).href);
      const moduleRecord = isRecord(loaded) ? loaded : null;
      return resolveConfig(moduleRecord?.default ?? loaded, warn);
    } catch (error) {
      const message = error instanceof Error ? error.message : error;
      warn(`failed to load ${name}: ${message ?? error}`);
      return resolveConfig(null, warn);
    }
  }
  return resolveConfig(null, warn);
}

// plugins/software-debugging/src/lib/ledger.ts
import { existsSync as existsSync3, lstatSync as lstatSync2, readdirSync as readdirSync2, readFileSync as readFileSync2 } from "node:fs";
import { basename, dirname, join as join3, relative as relative2, resolve as resolve2 } from "node:path";

// plugins/software-debugging/src/lib/work-order.ts
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
  return isRecord(value);
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
function setHas(set, value) {
  return typeof value === "string" && set.has(value);
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
function asBug(value) {
  if (!object(value)) return { id: value };
  const bug = { ...value };
  if (object(value.symptom)) bug.symptom = value.symptom;
  if (object(value.fix)) bug.fix = value.fix;
  return bug;
}
function asWorkOrder(raw) {
  const bugs = Array.isArray(raw.bugs) ? raw.bugs.map((item) => asBug(item)) : [];
  const workOrder = {
    ...raw,
    bugs
  };
  if (object(raw.run)) workOrder.run = raw.run;
  if (object(raw.resume)) workOrder.resume = raw.resume;
  return workOrder;
}
function collectionLength(value) {
  if (value === void 0 || value === null) {
    throw new TypeError(`Cannot read properties of ${String(value)} (reading 'length')`);
  }
  if (Array.isArray(value) || typeof value === "string") return value.length;
  if (typeof value === "object" && "length" in value) return Number(value.length);
  return Number(void 0);
}
function runStateForStatus(status) {
  if (status === "open") return "active";
  if (status === "paused") return "paused";
  if (status === "closed" || status === "aborted") return "closed";
  return void 0;
}
function extractWorkOrder(rawText) {
  const textValue = String(rawText ?? "");
  const matches = [...textValue.matchAll(FENCE)];
  if (matches.length !== 1) return { ok: false, error: `expected exactly one json debug-work-order/v1 block; found ${matches.length}` };
  try {
    const body = matches[0]?.[1] ?? "";
    const value = JSON.parse(body);
    return object(value) ? { ok: true, value } : { ok: false, error: "work order root must be an object" };
  } catch (error) {
    const message = error instanceof Error ? error.message : error;
    return { ok: false, error: `work order JSON parse failed: ${message ?? error}` };
  }
}
function validateWorkOrder(raw, config) {
  const findings = [];
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
  const observedRunState = object(raw.run) ? raw.run.state : void 0;
  if (alignedRunState && observedRunState !== alignedRunState) findings.push(`status ${String(raw.status)} requires run.state ${alignedRunState}`);
  const maxBugs = config?.limits?.maxBugs ?? 50;
  const maxHypotheses = config?.limits?.maxHypothesesPerBug ?? 20;
  if (!Array.isArray(raw.bugs) || raw.bugs.length < 1 || raw.bugs.length > maxBugs) findings.push(`bugs must contain 1..${maxBugs} items`);
  const bugIds = /* @__PURE__ */ new Set();
  const bugs = Array.isArray(raw.bugs) ? raw.bugs : [];
  for (const [index, bugValue] of bugs.entries()) {
    const at = `bugs[${index}]`;
    if (!object(bugValue)) {
      findings.push(`${at} must be an object`);
      continue;
    }
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
    const hypothesisIds = /* @__PURE__ */ new Set();
    for (const [hIndex, hypothesisValue] of (Array.isArray(bug.hypotheses) ? bug.hypotheses : []).entries()) {
      const hat = `${at}.hypotheses[${hIndex}]`;
      if (!object(hypothesisValue)) {
        findings.push(`${hat} must be an object`);
        continue;
      }
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
      if (!object(attemptValue)) {
        findings.push(`${aat} must be an object`);
        continue;
      }
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
    const fix = object(bug.fix) ? bug.fix : void 0;
    for (const id of Array.isArray(fix?.affectedBugIds) ? fix.affectedBugIds : []) if (!bugIds.has(id)) findings.push(`bugs[${index}].fix.affectedBugIds references unknown bug: ${String(id)}`);
  }
  if (raw.activeBugId !== null && !bugIds.has(raw.activeBugId)) findings.push("activeBugId references unknown bug");
  const typedBugs = bugs.map((bug) => asBug(bug));
  const active = typedBugs.filter((bug) => setHas(ACTIVE_BUG_STATUSES, bug.status));
  const run = object(raw.run) ? raw.run : void 0;
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
  const resume = object(raw.resume) ? raw.resume : void 0;
  for (const [index, bug] of typedBugs.entries()) if (["blocked", "deferred", "architecture-review"].includes(String(bug.status)) && resume?.nextBugId === bug.id && !text(resume?.nextAction)) findings.push(`bugs[${index}] requires a resume action`);
  const workOrder = asWorkOrder(raw);
  return findings.length === 0 ? { valid: true, findings, workOrder } : { valid: false, findings, workOrder };
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
    const message = error instanceof Error ? error.message : error;
    return { present: existsSync2(path), valid: false, findings: [`cannot read work order: ${message ?? error}`], path };
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
  const leaf = parts[1];
  return parts.length === 2 && (leaf === "intent.json" || leaf === "events.jsonl");
}

// plugins/software-debugging/src/lib/ledger.ts
var WRITER_ACTION = "(init|open|resume|activate|claim|affect|pause|close|abort|status|add-bug)";
var WRITER_RE = new RegExp(`debug-workflow\\.(?:mjs|ts)\\s+${WRITER_ACTION}\\b`, "u");
var WRITER_ALIAS_RE = new RegExp(`(?:\\$DWG\\b|debug-workflow)\\s+${WRITER_ACTION}\\b`, "u");
var EVENT_TYPES = /* @__PURE__ */ new Set(["opened", "activate", "claim", "affect", "queued-bug", "pause", "resume", "close", "abort", "architecture-review"]);
var ACTIVE_BUG_STATUSES2 = /* @__PURE__ */ new Set(["investigating", "fixing", "verifying"]);
var TERMINAL_BUG_STATUSES2 = /* @__PURE__ */ new Set(["resolved", "blocked", "deferred", "duplicate", "architecture-review"]);
function object2(value) {
  return isRecord(value);
}
function text2(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : error;
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
  const textValue = String(command ?? "");
  if (WRITER_RE.test(textValue) || WRITER_ALIAS_RE.test(textValue)) return true;
  return /\$DWG\b|debug-workflow\.(?:mjs|ts)\b/u.test(textValue) && new RegExp(`\\b${WRITER_ACTION}\\b`, "u").test(textValue);
}
function writerActionFromCommand(command) {
  const textValue = String(command ?? "");
  return WRITER_RE.exec(textValue)?.[1] || WRITER_ALIAS_RE.exec(textValue)?.[1] || null;
}
function commandFlag(command, name) {
  const matched = String(command ?? "").match(new RegExp(`--${name}(?:\\s+|=)(?:"([^"]+)"|'([^']+)'|(\\S+))`, "u"));
  return matched?.[1] || matched?.[2] || matched?.[3] || null;
}
function parseWriterStdout(stdout) {
  const lines = String(stdout ?? "").trim().split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const line = lines[index];
      if (line === void 0) continue;
      const value = JSON.parse(line);
      if (object2(value) && (value.id || value.path)) return value;
    } catch {
    }
  }
  return null;
}
function defaultHypotheses(bug) {
  const record = object2(bug) ? bug : void 0;
  const list = Array.isArray(record?.hypotheses) ? record.hypotheses : [];
  return list.map((item, index) => {
    const hyp = object2(item) ? item : {};
    return {
      id: text2(hyp.id) ? hyp.id : `H${index + 1}`,
      statement: text2(hyp.statement) ? hyp.statement : `hypothesis ${index + 1}`,
      falsifier: text2(hyp.falsifier) ? hyp.falsifier : `observation that would reject H${index + 1}`,
      status: "open",
      evidenceRefs: []
    };
  });
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
function readId(value) {
  if (value === void 0 || value === null) {
    throw new TypeError(`Cannot read properties of ${String(value)} (reading 'id')`);
  }
  if (object2(value)) return value.id;
  return void 0;
}
function statusKey(value) {
  return String(value);
}
function foldWorkOrder({ intent, events = [] }) {
  if (!object2(intent) || !Array.isArray(intent.bugs) || intent.bugs.length < 1) return null;
  let status = "open";
  let runState = "active";
  const run = object2(intent.run) ? intent.run : void 0;
  let epoch = Number(run?.epoch) > 0 ? Number(run?.epoch) : 1;
  let mode = run?.mode === "investigate-only" ? "investigate-only" : "investigate-and-fix";
  let activeBugId = readId(intent.bugs[0]);
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
  const eventList = Array.isArray(events) ? events : [];
  for (const eventValue of eventList) {
    const event = eventValue;
    if (!object2(event) || typeof event.t !== "string" || !EVENT_TYPES.has(event.t)) continue;
    if (event.t === "opened") {
      status = "open";
      runState = "active";
      if (typeof event.epoch === "number" && Number.isSafeInteger(event.epoch) && event.epoch > 0) epoch = event.epoch;
      if (event.mode === "investigate-only" || event.mode === "investigate-and-fix") mode = event.mode;
    } else if (event.t === "activate" && text2(event.bugId)) {
      status = "open";
      runState = "active";
      activeBugId = event.bugId;
      for (const id of Object.keys(bugStatus)) {
        const current = bugStatus[id];
        if (current !== void 0 && ACTIVE_BUG_STATUSES2.has(current)) bugStatus[id] = "queued";
      }
      bugStatus[event.bugId] = "investigating";
      resume.nextBugId = event.bugId;
    } else if (event.t === "claim" && event.kind === "hypothesis" && text2(event.hypothesisId)) {
      const bugId = event.bugId || activeBugId;
      hypothesisState[`${String(bugId)}:${event.hypothesisId}`] = {
        status: event.status === "supported" || event.status === "falsified" || event.status === "open" ? event.status : "open",
        evidenceRefs: Array.isArray(event.receiptIds) ? event.receiptIds.filter((id) => /^R-[0-9]+$/u.test(String(id))) : []
      };
    } else if (event.t === "claim" && event.kind === "root-cause") {
      const bugId = event.bugId || activeBugId;
      const refs = Array.isArray(event.receiptIds) ? event.receiptIds.filter((id) => /^R-[0-9]+$/u.test(String(id))) : [];
      rootCauseState[statusKey(bugId)] = {
        status: refs.length > 0 && text2(event.statement) ? "supported" : "inferred",
        statement: text2(event.statement) ? event.statement : "",
        causalChain: Array.isArray(event.causalChain) ? event.causalChain.filter((item) => text2(item)) : [],
        evidenceRefs: refs
      };
    } else if (event.t === "affect" && Array.isArray(event.affectedBugIds)) {
      affectState[statusKey(event.bugId || activeBugId)] = event.affectedBugIds.filter((id) => text2(id));
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
      if (event.architectureReview && activeBugId) bugStatus[statusKey(activeBugId)] = "architecture-review";
      else if (activeBugId) {
        const current = bugStatus[statusKey(activeBugId)];
        if (current === void 0 || !TERMINAL_BUG_STATUSES2.has(current)) {
          bugStatus[statusKey(activeBugId)] = text2(event.bugStatus) ? event.bugStatus : "blocked";
        }
      }
      activeBugId = null;
    } else if (event.t === "resume") {
      status = "open";
      runState = "active";
      if (typeof event.epoch === "number" && Number.isSafeInteger(event.epoch) && event.epoch > 0) epoch = event.epoch;
      else epoch += 1;
      activeBugId = text2(event.bugId) ? event.bugId : resume.nextBugId;
      if (activeBugId) bugStatus[statusKey(activeBugId)] = "investigating";
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
  const bugs = [...intent.bugs, ...extraBugs].map((rawValue) => {
    const raw = object2(rawValue) ? rawValue : { id: rawValue };
    const hypotheses = defaultHypotheses(raw);
    for (const hypothesis of hypotheses) {
      const claimed = hypothesisState[`${String(raw.id)}:${hypothesis.id}`];
      if (claimed) Object.assign(hypothesis, claimed);
    }
    const rawId = raw.id;
    let derived = bugStatus[statusKey(rawId)] || (raw.id === (status === "open" ? activeBugId : null) ? "investigating" : "queued");
    if ((status === "paused" || status === "closed" || status === "aborted") && ACTIVE_BUG_STATUSES2.has(derived)) {
      derived = status === "closed" ? "deferred" : "blocked";
    }
    const affect = affectState[statusKey(rawId)];
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
      rootCause: rootCauseState[statusKey(rawId)] || emptyRootCause(),
      fix: { ...emptyFix(), affectedBugIds: affect || [] },
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
    return { ok: false, error: `cannot read intent.json: ${errorMessage(error) ?? error}` };
  }
}
function loadDirectoryLedger(dir, config) {
  try {
    const info = lstatSync2(dir);
    if (!info.isDirectory() || info.isSymbolicLink()) return { present: true, valid: false, findings: ["ledger must be a regular directory"], path: dir, store: "events" };
  } catch (error) {
    return { present: false, valid: false, findings: [`cannot read ledger: ${errorMessage(error) ?? error}`], path: dir, store: "events" };
  }
  const intentFile = loadIntentFile(dir);
  if (!intentFile.ok) return { present: true, valid: false, findings: [intentFile.error], path: dir, store: "events" };
  const events = readEventLog(dir);
  if (!Array.isArray(events)) return { present: true, valid: false, findings: [events.error], path: dir, store: "events" };
  const size = Buffer.byteLength(JSON.stringify(intentFile.value), "utf8") + (existsSync3(join3(dir, "events.jsonl")) ? lstatSync2(join3(dir, "events.jsonl")).size : 0);
  if (size > config.ledger.maxBytes) return { present: true, valid: false, findings: [`work order exceeds ${config.ledger.maxBytes} bytes`], path: dir, store: "events" };
  const workOrder = foldWorkOrder({ intent: intentFile.value, events });
  if (!workOrder) return { present: true, valid: false, findings: ["intent.json is missing bugs"], path: dir, store: "events" };
  if (!/^DWO-[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(String(workOrder.id ?? ""))) return { present: true, valid: false, findings: ["id must match DWO-<stable-id>"], path: dir, store: "events" };
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
function isOpenOrPaused(status) {
  return status === "open" || status === "paused";
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
    if (loaded.valid && isOpenOrPaused(loaded.workOrder.status) && !seen.has(loaded.workOrder.id)) {
      found.push(loaded);
      seen.add(loaded.workOrder.id);
    }
    if (found.length >= config.ledger.maxFiles) return found;
  }
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const loaded = loadWorkOrder(join3(root, name), config);
    if (loaded.valid && isOpenOrPaused(loaded.workOrder.status) && !seen.has(loaded.workOrder.id)) {
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
  return `- ${rel} \u2014 ${String(order.id)} (${String(order.status)}, epoch ${String(order.run?.epoch)}, active ${order.activeBugId ?? "none"}; next: ${order.resume?.nextAction ?? "n/a"})`;
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
  isRecord,
  readStdinJson,
  eventSessionId,
  eventCwd,
  eventToolName,
  eventToolInput,
  eventToolResponse,
  eventAssistantMessage,
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
