import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { isRecord } from "@harness/core/hook-event";

import type { PluginConfig } from "./config.js";
import { loadWorkOrder, type WorkOrder, type Bug } from "./work-order.js";

const WRITER_ACTION = "(init|open|resume|activate|claim|affect|pause|close|abort|status|add-bug)";
const OWNER_WRITER_RE = new RegExp(`harness\\.(?:mjs|ts)\\s+debug\\s+${WRITER_ACTION}\\b`, "u");
const EVENT_TYPES = new Set(["opened", "activate", "claim", "affect", "queued-bug", "pause", "resume", "close", "abort", "architecture-review"]);
const ACTIVE_BUG_STATUSES = new Set(["investigating", "fixing", "verifying"]);
const TERMINAL_BUG_STATUSES = new Set(["resolved", "blocked", "deferred", "duplicate", "architecture-review"]);

export type LedgerEvent = Record<string, unknown>;

export type EventLogError = { error: string };

export type EventLogResult = LedgerEvent[] | EventLogError;

export type IntentFileResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string; value?: undefined };

export type LedgerStore = "events" | "markdown" | string | null;

export type LedgerLoadInvalid = {
  present: boolean;
  valid: false;
  findings: string[];
  path: string | null;
  workOrder?: WorkOrder | null;
  store: LedgerStore;
  intent?: Record<string, unknown>;
  events?: LedgerEvent[];
};

export type LedgerLoadValid = {
  present: true;
  valid: true;
  findings: string[];
  path: string;
  workOrder: WorkOrder;
  store: LedgerStore;
  intent?: Record<string, unknown>;
  events?: LedgerEvent[];
};

export type LedgerLoadResult = LedgerLoadInvalid | LedgerLoadValid;

function object(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function errorMessage(error: unknown): unknown {
  return error instanceof Error ? error.message : error;
}

export function ledgerRel(path: string, repoRoot: string): string {
  return relative(resolve(repoRoot), resolve(path)).replaceAll("\\", "/");
}

export function canonicalizeLedgerPath(path: string): string {
  const abs = resolve(path);
  const name = basename(abs);
  if (name === "intent.json" || name === "events.jsonl") return dirname(abs);
  return abs;
}

export function isLedgerManagedPath(path: string, repoRoot: string, config: PluginConfig): boolean {
  const rel = ledgerRel(path, repoRoot);
  if (rel.startsWith("../") || rel === "" || rel === config.ledger.root) return false;
  if (!rel.startsWith(`${config.ledger.root}/`)) return false;
  const rest = rel.slice(config.ledger.root.length + 1);
  return rest !== ".gitignore" && rest !== ".state" && !rest.startsWith(".state/");
}

export function isOfficialWriterCommand(command: unknown): boolean {
  const textValue = String(command ?? "");
  return !/(?:^|\s)(?:--help|-h)(?:\s|$)/u.test(textValue) && OWNER_WRITER_RE.test(textValue);
}

export function writerActionFromCommand(command: unknown): string | null {
  const textValue = String(command ?? "");
  if (/(?:^|\s)(?:--help|-h)(?:\s|$)/u.test(textValue)) return null;
  return OWNER_WRITER_RE.exec(textValue)?.[1] || null;
}

export function commandFlag(command: unknown, name: string): string | null {
  const matched = String(command ?? "").match(new RegExp(`--${name}(?:\\s+|=)(?:"([^"]+)"|'([^']+)'|(\\S+))`, "u"));
  return matched?.[1] || matched?.[2] || matched?.[3] || null;
}

export function parseWriterStdout(stdout: unknown): Record<string, unknown> | null {
  const lines = String(stdout ?? "").trim().split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const line = lines[index];
      if (line === undefined) continue;
      const value: unknown = JSON.parse(line);
      if (object(value) && (value.id || value.path)) return value;
    } catch {}
  }
  return null;
}

function defaultHypotheses(bug: unknown): Array<{ id: string; statement: string; falsifier: string; status: string; evidenceRefs: unknown[] }> {
  const record = object(bug) ? bug : undefined;
  const list = Array.isArray(record?.hypotheses) ? record.hypotheses : [];
  return list.map((item: unknown, index: number) => {
    const hyp = object(item) ? item : {};
    return {
      id: text(hyp.id) ? hyp.id : `H${index + 1}`,
      statement: text(hyp.statement) ? hyp.statement : `hypothesis ${index + 1}`,
      falsifier: text(hyp.falsifier) ? hyp.falsifier : `observation that would reject H${index + 1}`,
      status: "open",
      evidenceRefs: [],
    };
  });
}

function emptyFix(): { status: string; firstRevision: null; affectedBugIds: unknown[]; summary: string } {
  return { status: "not-started", firstRevision: null, affectedBugIds: [], summary: "" };
}

function emptyRootCause(): { status: string; statement: string; causalChain: unknown[]; evidenceRefs: unknown[] } {
  return { status: "unknown", statement: "", causalChain: [], evidenceRefs: [] };
}

function emptyVerification(): { originalReproduction: null; regression: unknown[]; debugCleanup: null } {
  return { originalReproduction: null, regression: [], debugCleanup: null };
}

function readId(value: unknown): unknown {
  if (value === undefined || value === null) {
    throw new TypeError(`Cannot read properties of ${String(value)} (reading 'id')`);
  }
  if (object(value)) return value.id;
  return undefined;
}

function statusKey(value: unknown): string {
  return String(value);
}

export function foldWorkOrder({ intent, events = [] }: { intent?: unknown; events?: unknown }): WorkOrder | null {
  if (!object(intent) || !Array.isArray(intent.bugs) || intent.bugs.length < 1) return null;
  let status = "open";
  let runState = "active";
  const run = object(intent.run) ? intent.run : undefined;
  let epoch = Number(run?.epoch) > 0 ? Number(run?.epoch) : 1;
  let mode = run?.mode === "investigate-only" ? "investigate-only" : "investigate-and-fix";
  let activeBugId: unknown = readId(intent.bugs[0]);
  const extraBugs: unknown[] = [];
  const bugStatus: Record<string, string> = {};
  const hypothesisState: Record<string, { status: string; evidenceRefs: unknown[] }> = {};
  const rootCauseState: Record<string, { status: string; statement: string; causalChain: unknown[]; evidenceRefs: unknown[] }> = {};
  const affectState: Record<string, unknown[]> = {};
  let resume = {
    nextBugId: activeBugId,
    nextAction: "run the exact reproduction and observe the failure",
    recoveryCommands: [] as unknown[],
  };

  const eventList = Array.isArray(events) ? events : [];
  for (const eventValue of eventList) {
    const event = eventValue;
    if (!object(event) || typeof event.t !== "string" || !EVENT_TYPES.has(event.t)) continue;
    if (event.t === "opened") {
      status = "open";
      runState = "active";
      if (typeof event.epoch === "number" && Number.isSafeInteger(event.epoch) && event.epoch > 0) epoch = event.epoch;
      if (event.mode === "investigate-only" || event.mode === "investigate-and-fix") mode = event.mode;
    } else if (event.t === "activate" && text(event.bugId)) {
      status = "open";
      runState = "active";
      activeBugId = event.bugId;
      for (const id of Object.keys(bugStatus)) {
        const current = bugStatus[id];
        if (current !== undefined && ACTIVE_BUG_STATUSES.has(current)) bugStatus[id] = "queued";
      }
      bugStatus[event.bugId] = "investigating";
      resume.nextBugId = event.bugId;
    } else if (event.t === "claim" && event.kind === "hypothesis" && text(event.hypothesisId)) {
      const bugId = event.bugId || activeBugId;
      hypothesisState[`${String(bugId)}:${event.hypothesisId}`] = {
        status: event.status === "supported" || event.status === "falsified" || event.status === "open" ? event.status : "open",
        evidenceRefs: Array.isArray(event.receiptIds) ? event.receiptIds.filter((id) => /^R-[0-9]+$/u.test(String(id))) : [],
      };
    } else if (event.t === "claim" && event.kind === "root-cause") {
      const bugId = event.bugId || activeBugId;
      const refs = Array.isArray(event.receiptIds) ? event.receiptIds.filter((id) => /^R-[0-9]+$/u.test(String(id))) : [];
      rootCauseState[statusKey(bugId)] = {
        status: refs.length > 0 && text(event.statement) ? "supported" : "inferred",
        statement: text(event.statement) ? event.statement : "",
        causalChain: Array.isArray(event.causalChain) ? event.causalChain.filter((item) => text(item)) : [],
        evidenceRefs: refs,
      };
    } else if (event.t === "affect" && Array.isArray(event.affectedBugIds)) {
      affectState[statusKey(event.bugId || activeBugId)] = event.affectedBugIds.filter((id) => text(id));
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
      if (event.architectureReview && activeBugId) bugStatus[statusKey(activeBugId)] = "architecture-review";
      else if (activeBugId) {
        const current = bugStatus[statusKey(activeBugId)];
        if (current === undefined || !TERMINAL_BUG_STATUSES.has(current)) {
          bugStatus[statusKey(activeBugId)] = text(event.bugStatus) ? event.bugStatus : "blocked";
        }
      }
      activeBugId = null;
    } else if (event.t === "resume") {
      status = "open";
      runState = "active";
      if (typeof event.epoch === "number" && Number.isSafeInteger(event.epoch) && event.epoch > 0) epoch = event.epoch;
      else epoch += 1;
      activeBugId = text(event.bugId) ? event.bugId : resume.nextBugId;
      if (activeBugId) bugStatus[statusKey(activeBugId)] = "investigating";
    } else if (event.t === "close") {
      status = "closed";
      runState = "closed";
      if (activeBugId) {
        const current = bugStatus[statusKey(activeBugId)];
        if (current === undefined || !TERMINAL_BUG_STATUSES.has(current)) bugStatus[statusKey(activeBugId)] = "resolved";
      }
      activeBugId = null;
    } else if (event.t === "abort") {
      status = "aborted";
      runState = "closed";
      activeBugId = null;
    } else if (event.t === "architecture-review" && text(event.bugId)) {
      bugStatus[event.bugId] = "architecture-review";
    }
  }

  const bugs: Bug[] = [...intent.bugs, ...extraBugs].map((rawValue) => {
    const raw: Record<string, unknown> = object(rawValue) ? rawValue : { id: rawValue };
    const hypotheses = defaultHypotheses(raw);
    for (const hypothesis of hypotheses) {
      const claimed = hypothesisState[`${String(raw.id)}:${hypothesis.id}`];
      if (claimed) Object.assign(hypothesis, claimed);
    }
    const rawId = raw.id;
    let derived = bugStatus[statusKey(rawId)] || (raw.id === (status === "open" ? activeBugId : null) ? "investigating" : "queued");
    if ((status === "paused" || status === "closed" || status === "aborted") && ACTIVE_BUG_STATUSES.has(derived)) {
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
        affectedBugIds: affect || [],
      },
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

export function readEventLog(dir: string): EventLogResult {
  const path = join(dir, "events.jsonl");
  if (!existsSync(path)) return [];
  const events: LedgerEvent[] = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (object(value)) events.push(value);
    } catch {
      return { error: "events.jsonl contains an invalid JSON line" };
    }
  }
  return events;
}

export function loadIntentFile(dir: string): IntentFileResult {
  const path = join(dir, "intent.json");
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return object(value) ? { ok: true, value } : { ok: false, error: "intent.json must be an object" };
  } catch (error: unknown) {
    return { ok: false, error: `cannot read intent.json: ${errorMessage(error) ?? error}` };
  }
}

function loadDirectoryLedger(dir: string, config: PluginConfig): LedgerLoadResult {
  try {
    const info = lstatSync(dir);
    if (!info.isDirectory() || info.isSymbolicLink()) return { present: true, valid: false, findings: ["ledger must be a regular directory"], path: dir, store: "events" };
  } catch (error: unknown) {
    return { present: false, valid: false, findings: [`cannot read ledger: ${errorMessage(error) ?? error}`], path: dir, store: "events" };
  }
  const intentFile = loadIntentFile(dir);
  if (!intentFile.ok) return { present: true, valid: false, findings: [intentFile.error], path: dir, store: "events" };
  const events = readEventLog(dir);
  if (!Array.isArray(events)) return { present: true, valid: false, findings: [events.error], path: dir, store: "events" };
  const size = Buffer.byteLength(JSON.stringify(intentFile.value), "utf8") + (existsSync(join(dir, "events.jsonl")) ? lstatSync(join(dir, "events.jsonl")).size : 0);
  if (size > config.ledger.maxBytes) return { present: true, valid: false, findings: [`work order exceeds ${config.ledger.maxBytes} bytes`], path: dir, store: "events" };
  const workOrder = foldWorkOrder({ intent: intentFile.value, events });
  if (!workOrder) return { present: true, valid: false, findings: ["intent.json is missing bugs"], path: dir, store: "events" };
  if (!/^DWO-[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(String(workOrder.id ?? ""))) return { present: true, valid: false, findings: ["id must match DWO-<stable-id>"], path: dir, store: "events" };
  return { present: true, valid: true, findings: [], path: dir, workOrder, store: "events", intent: intentFile.value, events };
}

export function loadLedger(path: string | null | undefined, config: PluginConfig): LedgerLoadResult {
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

export function findLedgerDir(repoRoot: string, config: PluginConfig, id: unknown): string | null {
  const root = join(repoRoot, config.ledger.root);
  let names: string[] = [];
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

function isOpenOrPaused(status: unknown): boolean {
  return status === "open" || status === "paused";
}

export function scanLedgers(repoRoot: string, config: PluginConfig): LedgerLoadValid[] {
  const root = join(repoRoot, config.ledger.root);
  let names: string[] = [];
  try { names = readdirSync(root).sort(); } catch { return []; }
  const found: LedgerLoadValid[] = [];
  const seen = new Set<unknown>();
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const dir = join(root, name);
    try {
      if (!lstatSync(dir).isDirectory() || !existsSync(join(dir, "intent.json"))) continue;
    } catch { continue; }
    const loaded = loadDirectoryLedger(dir, config);
    if (loaded.valid && isOpenOrPaused(loaded.workOrder.status) && !seen.has(loaded.workOrder.id)) {
      found.push(loaded);
      seen.add(loaded.workOrder.id);
    }
    if (found.length >= config.ledger.maxFiles) return found;
  }
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const loaded = loadWorkOrder(join(root, name), config);
    if (loaded.valid && isOpenOrPaused(loaded.workOrder.status) && !seen.has(loaded.workOrder.id)) {
      found.push({ ...loaded, store: "markdown" });
      seen.add(loaded.workOrder.id);
    }
    if (found.length >= config.ledger.maxFiles) break;
  }
  return found;
}

export function describeLedger(item: LedgerLoadValid, repoRoot: string): string {
  const rel = ledgerRel(item.path, repoRoot);
  const order = item.workOrder;
  return `- ${rel} — ${String(order.id)} (${String(order.status)}, epoch ${String(order.run?.epoch)}, active ${order.activeBugId ?? "none"}; next: ${order.resume?.nextAction ?? "n/a"})`;
}

export function ledgerDirFromId(repoRoot: string, config: PluginConfig, id: unknown): string | null {
  return findLedgerDir(repoRoot, config, id);
}
