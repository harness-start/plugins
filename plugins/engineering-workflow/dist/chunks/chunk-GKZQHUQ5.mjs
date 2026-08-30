// harness-source-hash: sha256:77602d3f9aa61c2535da235cff9515fc2753c443ea3c42d361b9b68abd9706b2

// core/src/owner-hook-runtime.ts
import { AsyncLocalStorage } from "node:async_hooks";
var invocationStorage = new AsyncLocalStorage();

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

// plugins/engineering-workflow/src/domains/debugging/lib/config.ts
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

// plugins/engineering-workflow/src/domains/debugging/lib/ledger.ts
import { existsSync as existsSync3, lstatSync as lstatSync2, readdirSync as readdirSync2, readFileSync as readFileSync2 } from "node:fs";
import { basename, dirname, join as join3, relative as relative2, resolve as resolve2 } from "node:path";

// plugins/engineering-workflow/src/domains/debugging/lib/work-order.ts
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
      exactKeys(bug.symptom, ["userOutcome", "expected", "actual", "reproduction", "acceptance", "environment"], `${at}.symptom`, findings);
      for (const key of ["expected", "actual", "reproduction", "environment"]) if (!text(bug.symptom[key])) findings.push(`${at}.symptom.${key} is required`);
      const hasUserOutcome = bug.symptom.userOutcome !== void 0;
      const hasAcceptance = bug.symptom.acceptance !== void 0;
      if (hasUserOutcome !== hasAcceptance) findings.push(`${at}.symptom.userOutcome and acceptance must be declared together`);
      if (hasUserOutcome && !text(bug.symptom.userOutcome)) findings.push(`${at}.symptom.userOutcome must be non-empty`);
      if (hasAcceptance && !text(bug.symptom.acceptance)) findings.push(`${at}.symptom.acceptance must be non-empty`);
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

// plugins/engineering-workflow/src/domains/debugging/lib/ledger.ts
var WRITER_ACTION = "(init|open|resume|activate|claim|affect|pause|close|abort|status|add-bug)";
var OWNER_WRITER_RE = new RegExp(`harness\\.(?:mjs|ts)\\s+debug\\s+${WRITER_ACTION}\\b`, "u");
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
  return !/(?:^|\s)(?:--help|-h)(?:\s|$)/u.test(textValue) && OWNER_WRITER_RE.test(textValue);
}
function writerActionFromCommand(command) {
  const textValue = String(command ?? "");
  if (/(?:^|\s)(?:--help|-h)(?:\s|$)/u.test(textValue)) return null;
  return OWNER_WRITER_RE.exec(textValue)?.[1] || null;
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
      if (activeBugId) {
        const current = bugStatus[statusKey(activeBugId)];
        if (current === void 0 || !TERMINAL_BUG_STATUSES2.has(current)) bugStatus[statusKey(activeBugId)] = "resolved";
      }
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
      fix: {
        ...emptyFix(),
        status: derived === "resolved" && raw.goal !== "diagnose" ? "applied" : "not-started",
        affectedBugIds: affect || []
      },
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

// plugins/engineering-workflow/src/domains/specification/lib/artifacts.ts
import { createHash } from "node:crypto";
import { lstatSync as lstatSync3, readFileSync as readFileSync3 } from "node:fs";
import { basename as basename2, dirname as dirname2, isAbsolute, relative as relative3, resolve as resolve3 } from "node:path";
import { TextDecoder } from "node:util";
var MAX_ARTIFACT_BYTES = 256 * 1024;
var CHANGE_NAME = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
var REQUIREMENT_ID = /^REQ-\d{3}$/u;
var TASK_ID = /^TASK-\d{3}$/u;
var REQUIRED_SPEC_SECTIONS = ["Intent", "Requirements", "Non-goals"];
var REQUIRED_PLAN_SECTIONS = ["Approach", "Change Surface", "Risks", "Validation"];
function finding(code, message, artifact = null) {
  return { code, message, artifact };
}
function isErrno(error) {
  return isRecord(error) && typeof error.code === "string";
}
function maskRange(text3) {
  return text3.replace(/[^\n]/gu, " ");
}
function maskFencedBlocks(text3) {
  let fence = null;
  let visible = "";
  for (const line of text3.match(/.*(?:\n|$)/gu) ?? []) {
    if (!line) continue;
    const body = line.endsWith("\n") ? line.slice(0, -1) : line;
    if (fence) {
      const close = body.match(/^ {0,3}(`+|~+)[ \t]*$/u)?.[1];
      visible += maskRange(line);
      if (close && close[0] === fence.character && close.length >= fence.length) fence = null;
      continue;
    }
    const open = body.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
    if (open) {
      fence = { character: open[0] ?? "", length: open.length };
      visible += maskRange(line);
    } else visible += line;
  }
  return visible;
}
function maskCodeSpans(text3) {
  let visible = "";
  let cursor = 0;
  const runs = [...text3.matchAll(/`+/gu)];
  for (let index = 0; index < runs.length; index += 1) {
    const open = runs[index];
    if (!open || open.index === void 0) continue;
    let closeIndex = index + 1;
    while (closeIndex < runs.length && runs[closeIndex]?.[0].length !== open[0].length) closeIndex += 1;
    if (closeIndex >= runs.length) continue;
    const close = runs[closeIndex];
    if (!close || close.index === void 0) continue;
    visible += text3.slice(cursor, open.index);
    visible += maskRange(text3.slice(open.index, close.index + close[0].length));
    cursor = close.index + close[0].length;
    index = closeIndex;
  }
  return visible + text3.slice(cursor);
}
function maskHtmlComments(text3) {
  let visible = "";
  let cursor = 0;
  while (cursor < text3.length) {
    const start = text3.indexOf("<!--", cursor);
    if (start < 0) return visible + text3.slice(cursor);
    visible += text3.slice(cursor, start);
    const end = text3.indexOf("-->", start + 4);
    if (end < 0) return visible + maskRange(text3.slice(start));
    visible += maskRange(text3.slice(start, end + 3));
    cursor = end + 3;
  }
  return visible;
}
function syntaxText(input) {
  return maskHtmlComments(maskCodeSpans(maskFencedBlocks(canonicalText(input))));
}
function hasRawHtmlBlock(text3) {
  return /^ {0,3}(?:<\?|<!\[CDATA\[|<![A-Z]|<\/?[A-Za-z][A-Za-z0-9-]*(?:\s|\/?>))/mu.test(text3);
}
function canonicalText(input) {
  const text3 = String(input ?? "").replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  return `${text3.replace(/\n+$/u, "")}
`;
}
function digestText(input) {
  return createHash("sha256").update(canonicalText(input), "utf8").digest("hex");
}
function sections(text3, level = 2) {
  const hashes = "#".repeat(level);
  const expression = new RegExp(`^${hashes}\\s+(.+?)\\s*$`, "gmu");
  const matches = [...text3.matchAll(expression)];
  const result = /* @__PURE__ */ new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    if (!current?.[1] || current.index === void 0) continue;
    const name = current[1].trim();
    const start = current.index + current[0].length;
    const end = matches[index + 1]?.index ?? text3.length;
    const values = result.get(name.toLowerCase()) ?? [];
    values.push(text3.slice(start, end).trim());
    result.set(name.toLowerCase(), values);
  }
  return result;
}
function requireUniqueSections(sectionMap, required, artifact, findings) {
  for (const name of required) {
    const values = sectionMap.get(name.toLowerCase()) ?? [];
    if (values.length === 0) findings.push(finding("missing-section", `${artifact} requires exactly one ## ${name} section.`, artifact));
    else if (values.length > 1) findings.push(finding("duplicate-section", `${artifact} contains duplicate ## ${name} sections.`, artifact));
    else if (!values[0]) findings.push(finding("empty-section", `${artifact} section ## ${name} must not be empty.`, artifact));
  }
}
function unresolved(text3) {
  return /(?:\bTODO\b|\bTBD\b|NEEDS[ _-]?CLARIFICATION|\[\s*\?\s*\])/iu.test(text3);
}
function validateSpecText(input) {
  const text3 = canonicalText(input);
  const syntax = syntaxText(text3);
  const findings = [];
  if (hasRawHtmlBlock(syntax)) findings.push(finding("raw-html-block", "spec.md does not allow raw HTML blocks.", "spec.md"));
  const sectionMap = sections(syntax);
  requireUniqueSections(sectionMap, REQUIRED_SPEC_SECTIONS, "spec.md", findings);
  if (unresolved(syntax)) findings.push(finding("unresolved-marker", "spec.md contains an unresolved marker.", "spec.md"));
  const requirementBody = (sectionMap.get("requirements") ?? [""])[0] ?? "";
  const headings = [...requirementBody.matchAll(/^###\s+(REQ-\d{3}):\s*(\S.*?)\s*$/gmu)];
  const requirements = [];
  const seen = /* @__PURE__ */ new Set();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!heading?.[1] || heading[2] === void 0 || heading.index === void 0) continue;
    const id = heading[1];
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? requirementBody.length;
    const body = requirementBody.slice(start, end);
    if (seen.has(id)) findings.push(finding("duplicate-requirement", `Duplicate requirement ${id}.`, "spec.md"));
    seen.add(id);
    const scenarios = [...body.matchAll(/^####\s+Scenario:\s*\S.*$/gmu)];
    if (scenarios.length === 0 || !/^-\s+Given\b\s*\S/imu.test(body) || !/^-\s+When\b\s*\S/imu.test(body) || !/^-\s+Then\b\s*\S/imu.test(body)) {
      findings.push(finding("invalid-scenario", `${id} requires a Scenario with non-empty Given, When, and Then bullets.`, "spec.md"));
    }
    requirements.push({ id, title: heading[2].trim() });
  }
  if (requirements.length === 0) findings.push(finding("missing-requirement", "spec.md requires at least one ### REQ-NNN requirement.", "spec.md"));
  return { kind: "spec", text: text3, digest: digestText(text3), requirements, findings };
}
function digestField(text3, name) {
  const matches = [...text3.matchAll(new RegExp(`^${name}:\\s*sha256:([0-9a-f]{64})\\s*$`, "gmu"))];
  return matches.length === 1 ? matches[0]?.[1] ?? null : null;
}
function validatePlanText(input, specResult) {
  const text3 = canonicalText(input);
  const syntax = syntaxText(text3);
  const findings = [];
  if (hasRawHtmlBlock(syntax)) findings.push(finding("raw-html-block", "plan.md does not allow raw HTML blocks.", "plan.md"));
  if (!specResult || specResult.findings.length > 0) findings.push(finding("invalid-upstream-spec", "plan.md requires a valid spec.md.", "plan.md"));
  const sectionMap = sections(syntax);
  requireUniqueSections(sectionMap, REQUIRED_PLAN_SECTIONS, "plan.md", findings);
  const specDigest = digestField(syntax, "Spec-Digest");
  if (!specDigest) findings.push(finding("missing-spec-digest", "plan.md requires one Spec-Digest: sha256:<digest> field.", "plan.md"));
  else if (specResult && specDigest !== specResult.digest) findings.push(finding("stale-spec-digest", "plan.md Spec-Digest does not match the current spec.md.", "plan.md"));
  for (const requirement of specResult?.requirements ?? []) {
    const count = [...syntax.matchAll(new RegExp(`\\b${requirement.id}\\b`, "gu"))].length;
    if (count === 0) findings.push(finding("uncovered-requirement", `plan.md does not cover ${requirement.id}.`, "plan.md"));
  }
  if (unresolved(syntax)) findings.push(finding("unresolved-marker", "plan.md contains an unresolved marker.", "plan.md"));
  return { kind: "plan", text: text3, digest: digestText(text3), specDigest, findings };
}
function splitValues(raw) {
  return String(raw ?? "").split(",").map((value) => value.trim().replace(/^`|`$/gu, "")).filter(Boolean);
}
function fieldOf(body, label) {
  const matches = [...body.matchAll(new RegExp(`^-\\s+${label}:\\s*(.*?)\\s*$`, "gimu"))];
  return { count: matches.length, value: matches[0]?.[1]?.trim() ?? "" };
}
function isSafeRepoPath(path, repoRoot = null) {
  if (!path || isAbsolute(path) || path.includes("\\") || /[\u0000-\u001f*?{}[\]]/u.test(path)) return false;
  const parts = path.split("/");
  if (!parts.every((part) => part && part !== "." && part !== "..")) return false;
  return !repoRoot || !hasSymlink(resolve3(repoRoot, path), repoRoot);
}
function pathOverlaps(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
function reachable(tasks, start, target, visited = /* @__PURE__ */ new Set()) {
  if (start === target) return true;
  if (visited.has(start)) return false;
  visited.add(start);
  const task = tasks.get(start);
  return task ? task.depends.some((dependency) => reachable(tasks, dependency, target, visited)) : false;
}
function validateTasksText(input, specResult, planResult, repoRoot = null) {
  const text3 = canonicalText(input);
  const syntax = syntaxText(text3);
  const findings = [];
  if (hasRawHtmlBlock(syntax)) findings.push(finding("raw-html-block", "tasks.md does not allow raw HTML blocks.", "tasks.md"));
  if (!specResult || specResult.findings.length > 0) findings.push(finding("invalid-upstream-spec", "tasks.md requires a valid spec.md.", "tasks.md"));
  if (!planResult || planResult.findings.length > 0) findings.push(finding("invalid-upstream-plan", "tasks.md requires a valid current plan.md.", "tasks.md"));
  const specDigest = digestField(syntax, "Spec-Digest");
  const planDigest = digestField(syntax, "Plan-Digest");
  if (!specDigest) findings.push(finding("missing-spec-digest", "tasks.md requires one Spec-Digest field.", "tasks.md"));
  else if (specResult && specDigest !== specResult.digest) findings.push(finding("stale-spec-digest", "tasks.md Spec-Digest does not match spec.md.", "tasks.md"));
  if (!planDigest) findings.push(finding("missing-plan-digest", "tasks.md requires one Plan-Digest field.", "tasks.md"));
  else if (planResult && planDigest !== planResult.digest) findings.push(finding("stale-plan-digest", "tasks.md Plan-Digest does not match plan.md.", "tasks.md"));
  const headings = [...syntax.matchAll(/^##\s+(TASK-\d{3}):\s*(\S.*?)\s*$/gmu)];
  const tasks = /* @__PURE__ */ new Map();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!heading?.[1] || heading.index === void 0) continue;
    const id = heading[1];
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? syntax.length;
    const body = syntax.slice(start, end);
    if (tasks.has(id)) findings.push(finding("duplicate-task", `Duplicate task ${id}.`, "tasks.md"));
    const requirementField = fieldOf(body, "Requirement");
    const dependsField = fieldOf(body, "Depends");
    const filesField = fieldOf(body, "Files");
    const verifyField = fieldOf(body, "Verify");
    const fields = [
      ["Requirement", requirementField],
      ["Depends", dependsField],
      ["Files", filesField],
      ["Verify", verifyField]
    ];
    for (const [name, field] of fields) {
      if (field.count !== 1 || !field.value) findings.push(finding("invalid-task-field", `${id} requires exactly one non-empty ${name} field.`, "tasks.md"));
    }
    const requirements = splitValues(requirementField.value);
    const depends = /^none$/iu.test(dependsField.value) ? [] : splitValues(dependsField.value);
    const files = splitValues(filesField.value);
    for (const requirement of requirements) if (!REQUIREMENT_ID.test(requirement)) findings.push(finding("invalid-requirement-reference", `${id} references invalid requirement ${requirement}.`, "tasks.md"));
    for (const dependency of depends) if (!TASK_ID.test(dependency)) findings.push(finding("invalid-task-reference", `${id} references invalid dependency ${dependency}.`, "tasks.md"));
    for (const file of files) if (!isSafeRepoPath(file, repoRoot)) findings.push(finding("unsafe-task-file", `${id} contains unsafe file path ${file}.`, "tasks.md"));
    if (new Set(files).size !== files.length) findings.push(finding("duplicate-task-file", `${id} repeats a Files entry.`, "tasks.md"));
    if (!tasks.has(id)) tasks.set(id, { id, requirements, depends, files });
  }
  if (headings.length === 0) findings.push(finding("missing-task", "tasks.md requires at least one ## TASK-NNN task.", "tasks.md"));
  const requirementIds = new Set(specResult?.requirements.map(({ id }) => id) ?? []);
  for (const task of tasks.values()) {
    for (const requirement of task.requirements) if (!requirementIds.has(requirement)) findings.push(finding("unknown-requirement", `${task.id} references unknown ${requirement}.`, "tasks.md"));
    for (const dependency of task.depends) {
      if (dependency === task.id) findings.push(finding("self-dependency", `${task.id} depends on itself.`, "tasks.md"));
      else if (!tasks.has(dependency)) findings.push(finding("unknown-dependency", `${task.id} references unknown ${dependency}.`, "tasks.md"));
    }
  }
  for (const requirement of requirementIds) {
    if (![...tasks.values()].some((task) => task.requirements.includes(requirement))) findings.push(finding("uncovered-requirement", `tasks.md does not assign ${requirement}.`, "tasks.md"));
  }
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  let hasCycle = false;
  const visit = (id) => {
    if (visiting.has(id)) {
      hasCycle = true;
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of tasks.get(id)?.depends ?? []) if (tasks.has(dependency)) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of tasks.keys()) visit(id);
  if (hasCycle) findings.push(finding("dependency-cycle", "tasks.md dependency graph contains a cycle.", "tasks.md"));
  const taskList = [...tasks.values()];
  for (let leftIndex = 0; leftIndex < taskList.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < taskList.length; rightIndex += 1) {
      const left = taskList[leftIndex];
      const right = taskList[rightIndex];
      if (!left || !right) continue;
      if (reachable(tasks, left.id, right.id) || reachable(tasks, right.id, left.id)) continue;
      for (const leftFile of left.files) for (const rightFile of right.files) {
        if (pathOverlaps(leftFile, rightFile)) findings.push(finding("parallel-file-overlap", `${left.id} and ${right.id} may run in parallel but overlap at ${leftFile} / ${rightFile}.`, "tasks.md"));
      }
    }
  }
  if (unresolved(syntax)) findings.push(finding("unresolved-marker", "tasks.md contains an unresolved marker.", "tasks.md"));
  return { kind: "tasks", text: text3, digest: digestText(text3), specDigest, planDigest, tasks: taskList, findings };
}
function decodeArtifact(path) {
  const bytes = readFileSync3(path);
  if (bytes.length > MAX_ARTIFACT_BYTES) return { error: finding("artifact-too-large", `${basename2(path)} exceeds 256 KiB.`, basename2(path)) };
  try {
    const text3 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text3.includes("\0") || /\r(?!\n)/u.test(text3) || text3.slice(1).includes("\uFEFF")) return { error: finding("invalid-text", `${basename2(path)} contains NUL, bare CR, or embedded BOM.`, basename2(path)) };
    return { text: text3 };
  } catch {
    return { error: finding("invalid-utf8", `${basename2(path)} is not valid UTF-8.`, basename2(path)) };
  }
}
function isWithin(parent, child) {
  const value = relative3(resolve3(parent), resolve3(child));
  return value === "" || !value.startsWith("..") && !isAbsolute(value);
}
function hasSymlink(path, stop) {
  let current = resolve3(path);
  const boundary = resolve3(stop);
  while (isWithin(boundary, current)) {
    try {
      if (lstatSync3(current).isSymbolicLink()) return true;
    } catch {
    }
    if (current === boundary) break;
    current = dirname2(current);
  }
  return false;
}
function inspectChange(changeDir) {
  const absolute = resolve3(changeDir);
  const findings = [];
  if (!CHANGE_NAME.test(basename2(absolute))) findings.push(finding("invalid-change-name", "Change directory must match NNN-lowercase-slug.", basename2(absolute)));
  if (basename2(dirname2(absolute)) !== ".specs") findings.push(finding("invalid-spec-root", "Change directory must be directly under .specs/.", basename2(absolute)));
  if (hasSymlink(absolute, dirname2(absolute))) findings.push(finding("symlink-artifact", "Change directory or artifact path contains a symlink.", basename2(absolute)));
  const values = {};
  for (const name of ["spec.md", "plan.md", "tasks.md"]) {
    const path = resolve3(absolute, name);
    try {
      if (lstatSync3(path).isSymbolicLink()) {
        findings.push(finding("symlink-artifact", `${name} must not be a symlink.`, name));
        continue;
      }
      const decoded = decodeArtifact(path);
      if ("error" in decoded) findings.push(decoded.error);
      else values[name] = decoded.text;
    } catch (error) {
      if (!isErrno(error) || error.code !== "ENOENT") findings.push(finding("artifact-read-error", `Cannot read ${name}.`, name));
    }
  }
  const spec = values["spec.md"] === void 0 ? null : validateSpecText(values["spec.md"]);
  const plan = values["plan.md"] === void 0 ? null : validatePlanText(values["plan.md"], spec);
  const tasks = values["tasks.md"] === void 0 ? null : validateTasksText(values["tasks.md"], spec, plan, dirname2(dirname2(absolute)));
  for (const result of [spec, plan, tasks]) if (result) findings.push(...result.findings);
  return { changeDir: absolute, spec, plan, tasks, findings };
}
function formatFindings(findings) {
  return findings.map(({ code, message }) => `${code}: ${message}`).join(" ");
}

// core/src/plugin-workdir.ts
import { mkdirSync, readFileSync as readFileSync4, writeFileSync } from "node:fs";
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
    current = readFileSync4(ignore, "utf8");
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
  describeLedger,
  digestText,
  inspectChange,
  formatFindings
};
