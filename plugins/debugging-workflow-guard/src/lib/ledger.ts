import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { loadWorkOrder } from "./work-order.js";

const WRITER_ACTION = "(init|open|resume|activate|claim|affect|pause|close|abort|status|add-bug)";
const WRITER_RE = new RegExp(`debug-workflow\\.(?:mjs|ts)\\s+${WRITER_ACTION}\\b`, "u");
const WRITER_ALIAS_RE = new RegExp(`(?:\\$DWG\\b|debug-workflow)\\s+${WRITER_ACTION}\\b`, "u");
const EVENT_TYPES = new Set(["opened", "activate", "claim", "affect", "queued-bug", "pause", "resume", "close", "abort", "architecture-review"]);
const ACTIVE_BUG_STATUSES = new Set(["investigating", "fixing", "verifying"]);
const TERMINAL_BUG_STATUSES = new Set(["resolved", "blocked", "deferred", "duplicate", "architecture-review"]);

function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function text(value) { return typeof value === "string" && value.trim().length > 0; }

export function ledgerRel(path, repoRoot) {
  return relative(resolve(repoRoot), resolve(path)).replaceAll("\\", "/");
}

export function canonicalizeLedgerPath(path) {
  const abs = resolve(path);
  const name = basename(abs);
  if (name === "intent.json" || name === "events.jsonl") return dirname(abs);
  return abs;
}

export function isLedgerManagedPath(path, repoRoot, config) {
  const rel = ledgerRel(path, repoRoot);
  if (rel.startsWith("../") || rel === "" || rel === config.ledger.root) return false;
  if (!rel.startsWith(`${config.ledger.root}/`)) return false;
  const rest = rel.slice(config.ledger.root.length + 1);
  return rest !== ".gitignore" && rest !== ".state" && !rest.startsWith(".state/");
}

export function isOfficialWriterCommand(command) {
  const text = String(command ?? "");
  if (WRITER_RE.test(text) || WRITER_ALIAS_RE.test(text)) return true;
  return /\$DWG\b|debug-workflow\.(?:mjs|ts)\b/u.test(text) && new RegExp(`\\b${WRITER_ACTION}\\b`, "u").test(text);
}

export function writerActionFromCommand(command) {
  const text = String(command ?? "");
  return WRITER_RE.exec(text)?.[1] || WRITER_ALIAS_RE.exec(text)?.[1] || null;
}

export function commandFlag(command, name) {
  const matched = String(command ?? "").match(new RegExp(`--${name}(?:\\s+|=)(?:"([^"]+)"|'([^']+)'|(\\S+))`, "u"));
  return matched?.[1] || matched?.[2] || matched?.[3] || null;
}

export function parseWriterStdout(stdout) {
  const lines = String(stdout ?? "").trim().split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]);
      if (object(value) && (value.id || value.path)) return value;
    } catch {}
  }
  return null;
}

function defaultHypotheses(bug) {
  const list = Array.isArray(bug?.hypotheses) ? bug.hypotheses : [];
  return list.map((item, index) => ({
    id: text(item.id) ? item.id : `H${index + 1}`,
    statement: text(item.statement) ? item.statement : `hypothesis ${index + 1}`,
    falsifier: text(item.falsifier) ? item.falsifier : `observation that would reject H${index + 1}`,
    status: "open",
    evidenceRefs: [],
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

export function foldWorkOrder({ intent, events = [] }) {
  if (!object(intent) || !Array.isArray(intent.bugs) || intent.bugs.length < 1) return null;
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
    recoveryCommands: [],
  };

  for (const event of events) {
    if (!object(event) || !EVENT_TYPES.has(event.t)) continue;
    if (event.t === "opened") {
      status = "open";
      runState = "active";
      if (Number.isSafeInteger(event.epoch) && event.epoch > 0) epoch = event.epoch;
      if (event.mode === "investigate-only" || event.mode === "investigate-and-fix") mode = event.mode;
    } else if (event.t === "activate" && text(event.bugId)) {
      status = "open";
      runState = "active";
      activeBugId = event.bugId;
      for (const id of Object.keys(bugStatus)) if (ACTIVE_BUG_STATUSES.has(bugStatus[id])) bugStatus[id] = "queued";
      bugStatus[event.bugId] = "investigating";
      resume.nextBugId = event.bugId;
    } else if (event.t === "claim" && event.kind === "hypothesis" && text(event.hypothesisId)) {
      const bugId = event.bugId || activeBugId;
      hypothesisState[`${bugId}:${event.hypothesisId}`] = {
        status: ["supported", "falsified", "open"].includes(event.status) ? event.status : "open",
        evidenceRefs: Array.isArray(event.receiptIds) ? event.receiptIds.filter((id) => /^R-[0-9]+$/u.test(String(id))) : [],
      };
    } else if (event.t === "claim" && event.kind === "root-cause") {
      const bugId = event.bugId || activeBugId;
      const refs = Array.isArray(event.receiptIds) ? event.receiptIds.filter((id) => /^R-[0-9]+$/u.test(String(id))) : [];
      rootCauseState[bugId] = {
        status: refs.length > 0 && text(event.statement) ? "supported" : "inferred",
        statement: text(event.statement) ? event.statement : "",
        causalChain: Array.isArray(event.causalChain) ? event.causalChain.filter((item) => text(item)) : [],
        evidenceRefs: refs,
      };
    } else if (event.t === "affect" && Array.isArray(event.affectedBugIds)) {
      affectState[event.bugId || activeBugId] = event.affectedBugIds.filter((id) => text(id));
    } else if (event.t === "queued-bug" && object(event.bug) && text(event.bug.id)) {
      extraBugs.push(event.bug);
      bugStatus[event.bug.id] = "queued";
    } else if (event.t === "pause") {
      status = "paused";
      runState = "paused";
      resume = {
        nextBugId: text(event.nextBugId) ? event.nextBugId : activeBugId,
        nextAction: text(event.nextAction) ? event.nextAction : "resume the next concrete debug action",
        recoveryCommands: Array.isArray(event.recoveryCommands) ? event.recoveryCommands.filter((item) => text(item)) : [],
      };
      if (event.architectureReview && activeBugId) bugStatus[activeBugId] = "architecture-review";
      else if (activeBugId && !TERMINAL_BUG_STATUSES.has(bugStatus[activeBugId])) bugStatus[activeBugId] = text(event.bugStatus) ? event.bugStatus : "blocked";
      activeBugId = null;
    } else if (event.t === "resume") {
      status = "open";
      runState = "active";
      if (Number.isSafeInteger(event.epoch) && event.epoch > 0) epoch = event.epoch;
      else epoch += 1;
      activeBugId = text(event.bugId) ? event.bugId : resume.nextBugId;
      if (activeBugId) bugStatus[activeBugId] = "investigating";
    } else if (event.t === "close") {
      status = "closed";
      runState = "closed";
      activeBugId = null;
    } else if (event.t === "abort") {
      status = "aborted";
      runState = "closed";
      activeBugId = null;
    } else if (event.t === "architecture-review" && text(event.bugId)) {
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
    if ((status === "paused" || status === "closed" || status === "aborted") && ACTIVE_BUG_STATUSES.has(derived)) {
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
      residualRisks: [],
    };
  });

  return {
    schema: "debug-work-order/v1",
    id: intent.id,
    status,
    run: { epoch, state: runState, mode },
    activeBugId,
    bugs,
    resume,
  };
}

export function readEventLog(dir) {
  const path = join(dir, "events.jsonl");
  if (!existsSync(path)) return [];
  const events = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (object(value)) events.push(value);
    } catch {
      return { error: "events.jsonl contains an invalid JSON line" };
    }
  }
  return events;
}

export function loadIntentFile(dir) {
  const path = join(dir, "intent.json");
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return object(value) ? { ok: true, value } : { ok: false, error: "intent.json must be an object" };
  } catch (error) {
    return { ok: false, error: `cannot read intent.json: ${error?.message ?? error}` };
  }
}

function loadDirectoryLedger(dir, config) {
  try {
    const info = lstatSync(dir);
    if (!info.isDirectory() || info.isSymbolicLink()) return { present: true, valid: false, findings: ["ledger must be a regular directory"], path: dir, store: "events" };
  } catch (error) {
    return { present: false, valid: false, findings: [`cannot read ledger: ${error?.message ?? error}`], path: dir, store: "events" };
  }
  const intentFile = loadIntentFile(dir);
  if (!intentFile.ok) return { present: true, valid: false, findings: [intentFile.error], path: dir, store: "events" };
  const events = readEventLog(dir);
  if (events?.error) return { present: true, valid: false, findings: [events.error], path: dir, store: "events" };
  const size = Buffer.byteLength(JSON.stringify(intentFile.value), "utf8") + (existsSync(join(dir, "events.jsonl")) ? lstatSync(join(dir, "events.jsonl")).size : 0);
  if (size > config.ledger.maxBytes) return { present: true, valid: false, findings: [`work order exceeds ${config.ledger.maxBytes} bytes`], path: dir, store: "events" };
  const workOrder = foldWorkOrder({ intent: intentFile.value, events });
  if (!workOrder) return { present: true, valid: false, findings: ["intent.json is missing bugs"], path: dir, store: "events" };
  if (!/^DWO-[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(workOrder.id)) return { present: true, valid: false, findings: ["id must match DWO-<stable-id>"], path: dir, store: "events" };
  return { present: true, valid: true, findings: [], path: dir, workOrder, store: "events", intent: intentFile.value, events };
}

export function loadLedger(path, config) {
  if (!path) return { present: false, valid: false, findings: ["ledger path is missing"], path: null, workOrder: null, store: null };
  const abs = resolve(path);
  if (existsSync(abs) && lstatSync(abs).isDirectory()) return loadDirectoryLedger(abs, config);
  const name = basename(abs);
  if (name === "intent.json" || name === "events.jsonl") return loadDirectoryLedger(dirname(abs), config);
  if (name.endsWith(".md")) {
    const loaded = loadWorkOrder(abs, config);
    return { ...loaded, store: loaded.present ? "markdown" : null };
  }
  return { present: existsSync(abs), valid: false, findings: ["unsupported ledger path"], path: abs, workOrder: null, store: null };
}

export function findLedgerDir(repoRoot, config, id) {
  const root = join(repoRoot, config.ledger.root);
  let names = [];
  try { names = readdirSync(root); } catch { return null; }
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const dir = join(root, name);
    try {
      if (!lstatSync(dir).isDirectory() || !existsSync(join(dir, "intent.json"))) continue;
    } catch { continue; }
    const loaded = loadDirectoryLedger(dir, config);
    if (loaded.valid && loaded.workOrder.id === id) return dir;
  }
  return null;
}

export function scanLedgers(repoRoot, config) {
  const root = join(repoRoot, config.ledger.root);
  let names = [];
  try { names = readdirSync(root).sort(); } catch { return []; }
  const found = [];
  const seen = new Set();
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const dir = join(root, name);
    try {
      if (!lstatSync(dir).isDirectory() || !existsSync(join(dir, "intent.json"))) continue;
    } catch { continue; }
    const loaded = loadDirectoryLedger(dir, config);
    if (loaded.valid && ["open", "paused"].includes(loaded.workOrder.status) && !seen.has(loaded.workOrder.id)) {
      found.push(loaded);
      seen.add(loaded.workOrder.id);
    }
    if (found.length >= config.ledger.maxFiles) return found;
  }
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const loaded = loadWorkOrder(join(root, name), config);
    if (loaded.valid && ["open", "paused"].includes(loaded.workOrder.status) && !seen.has(loaded.workOrder.id)) {
      found.push({ ...loaded, store: "markdown" });
      seen.add(loaded.workOrder.id);
    }
    if (found.length >= config.ledger.maxFiles) break;
  }
  return found;
}

export function describeLedger(item, repoRoot) {
  const rel = ledgerRel(item.path, repoRoot);
  const order = item.workOrder;
  return `- ${rel} — ${order.id} (${order.status}, epoch ${order.run.epoch}, active ${order.activeBugId ?? "none"}; next: ${order.resume?.nextAction ?? "n/a"})`;
}

export function ledgerDirFromId(repoRoot, config, id) {
  return findLedgerDir(repoRoot, config, id);
}
