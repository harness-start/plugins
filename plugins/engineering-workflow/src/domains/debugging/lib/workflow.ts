import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { relative, resolve } from "node:path";

import { isRecord } from "@harness/core/hook-event";

import { DEFAULT_CONFIG, type PluginConfig } from "./config.js";
import type { CommandOutcome } from "./hook-io.js";
import { canonicalizeLedgerPath, commandFlag, findLedgerDir, isOfficialWriterCommand, loadLedger, parseWriterStdout, scanLedgers, writerActionFromCommand } from "./ledger.js";
import { acquireLease, emptyState, readState, releaseLease, writeState, type Receipt, type SessionState } from "./state-store.js";
import { isWorkOrderPath, type Bug, type WorkOrder } from "./work-order.js";

function gitRoot(cwd: string): string {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    return resolve(cwd, relative(realpathSync(cwd), realpathSync(top)));
  }
  catch { return resolve(cwd); }
}

export function hash(value: unknown): string { return createHash("sha256").update(String(value)).digest("hex"); }
export function normalizeCommand(command: unknown): string { return String(command ?? "").trim().replace(/\s+/gu, " "); }

function safeRegex(pattern: string): RegExp | null {
  try { return new RegExp(pattern, "u"); } catch { return null; }
}

function matchesAny(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => Boolean(safeRegex(pattern)?.test(value)));
}

export type WorkflowIdle = { kind: "idle"; repoRoot?: string; state?: SessionState; findings?: undefined; workOrder?: undefined; receipt?: undefined; active?: undefined; path?: undefined };
export type WorkflowInvalid = { kind: "invalid"; findings: string[]; repoRoot?: string; state?: SessionState; path?: string; workOrder?: undefined; receipt?: undefined; active?: undefined };
export type WorkflowConflict = { kind: "conflict"; path: string; findings: string[]; repoRoot?: undefined; state?: undefined; workOrder?: undefined; receipt?: undefined; active?: undefined };
export type WorkflowBound = { kind: "bound"; repoRoot: string; workOrder: WorkOrder; state: SessionState; active: boolean; findings?: undefined; receipt?: undefined; path?: undefined };
export type WorkflowInactive = { kind: "inactive"; repoRoot: string; state: SessionState; workOrder: WorkOrder; findings?: undefined; receipt?: undefined; active?: undefined; path?: undefined };
export type WorkflowActive = { kind: "active"; repoRoot: string; state: SessionState; workOrder: WorkOrder; findings?: undefined; receipt?: undefined; active?: undefined; path?: undefined };
export type WorkflowRecorded = { kind: "recorded"; repoRoot: string; state: SessionState; workOrder: WorkOrder; receipt: Receipt; findings?: undefined; active?: undefined; path?: undefined };

export type BindMutationResult = WorkflowIdle | WorkflowInvalid | WorkflowConflict | WorkflowBound;
export type RefreshResult = WorkflowIdle | WorkflowInvalid | WorkflowInactive | WorkflowActive;
export type RecordReceiptResult = RefreshResult | WorkflowRecorded;
export type WriterHookResult = BindMutationResult | RefreshResult;

export type BindMutationInput = {
  cwd: string;
  sessionId: string | null;
  touchedPaths?: unknown;
  config?: PluginConfig;
  now?: number;
};

export type RefreshInput = {
  cwd: string;
  sessionId: string | null;
  config?: PluginConfig;
};

export type RecordReceiptInput = {
  cwd: string;
  sessionId: string | null;
  config?: PluginConfig;
  kind: string;
  command?: string | null;
  paths?: string[];
  outcome?: string | null;
  summary?: string;
  now?: number;
};

export type PreMutationInput = {
  cwd: string;
  sessionId: string | null;
  paths: string[];
  config?: PluginConfig;
};

export type MutationDecision = {
  action: "allow" | "block" | "report";
  reason?: string;
};

export type BindAfterWriterInput = {
  cwd: string;
  sessionId: string | null;
  command?: string;
  stdout?: string;
  config?: PluginConfig;
  now?: number;
};

export function configuredOutcome(command: unknown, observed: CommandOutcome, config: PluginConfig): CommandOutcome {
  const normalized = normalizeCommand(command);
  if (matchesAny(normalized, config.commands.expectedFailurePatterns)) return "failure";
  if (matchesAny(normalized, config.commands.expectedSuccessPatterns)) return "success";
  return observed;
}

export function classifyCommand(command: unknown, bug: Bug | undefined, config: PluginConfig): string {
  const normalized = normalizeCommand(command);
  const reproduction = isRecord(bug?.symptom) ? bug.symptom.reproduction : undefined;
  if (normalizeCommand(reproduction) === normalized || matchesAny(normalized, config.commands.reproductionPatterns)) return "reproduction";
  if (matchesAny(normalized, config.commands.verificationPatterns) || /(?:^|\s)(?:test|tests|pytest|phpunit|rspec|cargo test|go test|npm test|pnpm test|yarn test|mvn test|gradle test)(?:\s|$)/iu.test(normalized)) return "verification";
  return "command";
}

export function classifyPath(path: string, repoRoot: string, config: PluginConfig): string {
  const rel = relative(repoRoot, resolve(path)).replaceAll("\\", "/");
  const groups = config.paths;
  if (matchesAny(rel, groups.nonCodePatterns)) return "non-code";
  if (matchesAny(rel, groups.diagnosticPatterns) || /(?:^|\/)(?:tmp|temp|debug|diagnostics?)(?:\/|$)/iu.test(rel)) return "diagnostic";
  if (matchesAny(rel, groups.testPatterns) || /(?:^|\/)(?:test|tests|spec|specs|__tests__)(?:\/|$)|(?:\.test|\.spec)\.[^.]+$/iu.test(rel)) return "test";
  if (matchesAny(rel, groups.codePatterns)) return "code";
  if (/\.(?:md|txt|rst|adoc|png|jpe?g|gif|svg|pdf)$/iu.test(rel)) return "non-code";
  return "code";
}

function sameLedgerPath(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  return canonicalizeLedgerPath(left) === canonicalizeLedgerPath(right);
}

export function bindWorkOrderAfterMutation({ cwd, sessionId, touchedPaths, config = DEFAULT_CONFIG, now = Date.now() }: BindMutationInput): BindMutationResult {
  const repoRoot = gitRoot(cwd);
  const candidates = [...new Set((Array.isArray(touchedPaths) ? touchedPaths : []).map((path) => canonicalizeLedgerPath(String(path))))].filter((path) => isWorkOrderPath(path, repoRoot, config));
  if (candidates.length === 0) return { kind: "idle" };
  if (candidates.length > 1) return { kind: "invalid", findings: ["one hook event cannot bind multiple work orders"] };
  const candidate = candidates[0];
  if (candidate === undefined) return { kind: "idle" };
  let existing = readState(sessionId, repoRoot);
  if (existing.bound && existing.workOrderPath && !sameLedgerPath(existing.workOrderPath, candidate)) {
    const previous = loadLedger(existing.workOrderPath, config);
    const previousComplete = previous.valid && previous.workOrder.status === "closed"
      && completionFindings({ kind: "inactive", repoRoot, state: existing, workOrder: previous.workOrder }).length === 0;
    if (previous.valid && (["aborted", "paused"].includes(String(previous.workOrder.status)) || previousComplete)) {
      releaseLease({ repoRoot, workOrderId: String(previous.workOrder.id ?? ""), sessionId });
      existing = emptyState();
    } else {
      return { kind: "conflict", path: candidate, findings: [`this session is already bound to ${relative(repoRoot, existing.workOrderPath)}`] };
    }
  }
  const checked = loadLedger(candidate, config);
  if (!checked.valid) {
    const state = {
      ...(existing.bound ? existing : emptyState()),
      bound: true,
      workOrderPath: candidate,
      invalid: true,
      eventSeq: existing.bound ? existing.eventSeq + 1 : 1,
      updatedAt: now,
    };
    writeState(sessionId, repoRoot, state);
    return { kind: "invalid", repoRoot, state, path: candidate, findings: checked.findings };
  }
  const workOrder = checked.workOrder;
  if (existing.bound && existing.workOrderId && existing.workOrderId !== workOrder.id) {
    existing.invalid = true;
    existing.eventSeq += 1;
    writeState(sessionId, repoRoot, existing);
    return { kind: "invalid", repoRoot, state: existing, path: candidate, findings: ["a corrected bound work order must preserve its id and run.epoch"] };
  }
  if (existing.bound && existing.workOrderId && Number(workOrder.run?.epoch) < Number(existing.epoch)) {
    existing.invalid = true;
    existing.eventSeq += 1;
    writeState(sessionId, repoRoot, existing);
    return { kind: "invalid", repoRoot, state: existing, path: candidate, findings: ["a corrected bound work order must preserve its id and run.epoch"] };
  }
  const active = workOrder.status === "open" && workOrder.run?.state === "active";
  if (active) {
    const lease = acquireLease({ repoRoot, workOrderId: String(workOrder.id ?? ""), epoch: workOrder.run?.epoch, sessionId, leaseMinutes: config.limits.leaseMinutes, now });
    if (!lease.ok) return { kind: "conflict", path: candidate, findings: [lease.reason ?? "work-order lease update is already in progress"] };
  }
  const state = {
    ...(existing.bound ? existing : emptyState()),
    bound: true,
    workOrderPath: checked.path ?? candidate,
    workOrderId: workOrder.id == null ? null : String(workOrder.id),
    epoch: Number(workOrder.run?.epoch) || 0,
    activeBugId: workOrder.activeBugId == null ? null : String(workOrder.activeBugId),
    revision: existing.bound ? existing.revision + 1 : 1,
    eventSeq: existing.bound ? existing.eventSeq + 1 : 1,
    invalid: false,
    updatedAt: now,
  };
  writeState(sessionId, repoRoot, state);
  return { kind: "bound", repoRoot, workOrder, state, active };
}

export function refreshBoundWorkOrder({ cwd, sessionId, config = DEFAULT_CONFIG }: RefreshInput): RefreshResult {
  const repoRoot = gitRoot(cwd);
  const state = readState(sessionId, repoRoot);
  if (!state.bound || !state.workOrderPath) return { kind: "idle", repoRoot, state };
  const checked = loadLedger(state.workOrderPath, config);
  if (!checked.valid) {
    state.invalid = true;
    writeState(sessionId, repoRoot, state);
    return { kind: "invalid", repoRoot, state, findings: checked.findings };
  }
  if (checked.workOrder.id !== state.workOrderId) return { kind: "invalid", repoRoot, state, findings: ["bound work-order id or run.epoch changed unexpectedly"] };
  if (Number(checked.workOrder.run?.epoch) < Number(state.epoch)) return { kind: "invalid", repoRoot, state, findings: ["bound work-order id or run.epoch changed unexpectedly"] };
  if (Number(checked.workOrder.run?.epoch) > Number(state.epoch)) {
    state.epoch = Number(checked.workOrder.run?.epoch);
    writeState(sessionId, repoRoot, state);
  }
  state.invalid = false;
  state.activeBugId = checked.workOrder.activeBugId == null ? null : String(checked.workOrder.activeBugId);
  if (checked.workOrder.status !== "open" || checked.workOrder.run?.state !== "active") {
    return { kind: "inactive", repoRoot, state, workOrder: checked.workOrder };
  }
  return { kind: "active", repoRoot, state, workOrder: checked.workOrder };
}

export function recordReceipt({ cwd, sessionId, config = DEFAULT_CONFIG, kind, command = null, paths = [], outcome = null, summary = "", now = Date.now() }: RecordReceiptInput): RecordReceiptResult {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (live.kind !== "active") return live;
  const bug = live.workOrder.bugs.find((item) => item.id === live.workOrder.activeBugId)!;
  live.state.eventSeq += 1;
  if (kind === "mutation") live.state.mutationSeq = live.state.eventSeq;
  const receipt: Receipt = {
    id: `R-${live.state.eventSeq}`,
    bugId: bug.id,
    kind: command ? classifyCommand(command, bug, config) : kind,
    commandHash: command ? hash(normalizeCommand(command)) : null,
    paths: paths.map((path) => relative(live.repoRoot, resolve(path)).replaceAll("\\", "/")).slice(0, 20),
    outcome,
    summary: String(summary).replace(/\s+/gu, " ").slice(0, 240),
    mutationSeq: live.state.mutationSeq,
    revision: live.state.revision,
    at: now,
  };
  live.state.receipts.push(receipt);
  if (receipt.kind === "reproduction" && outcome === "failure" && Number(receipt.mutationSeq) > 0) {
    const attemptKey = String(bug.id ?? "");
    live.state.attempts[attemptKey] = Number(live.state.attempts[attemptKey] || 0) + 1;
  }
  live.state.receipts = live.state.receipts.slice(-config.limits.maxReceipts);
  writeState(sessionId, live.repoRoot, live.state);
  return { ...live, kind: "recorded", receipt };
}

export function preMutationDecision({ cwd, sessionId, paths, config = DEFAULT_CONFIG }: PreMutationInput): MutationDecision {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (["idle", "inactive"].includes(live.kind)) return { action: "allow", reason: "no active bound work order" };
  const boundPath = live.kind === "invalid" ? live.state?.workOrderPath : undefined;
  if (live.kind === "invalid" && boundPath && paths.length > 0 && paths.every((path) => resolve(path) === resolve(boundPath))) {
    return { action: "allow", reason: "allowing correction of the invalid bound work order" };
  }
  if (live.kind !== "active") return { action: config.mode === "block" ? "block" : "report", reason: `bound work order is invalid: ${(live.findings ?? []).join("; ")}` };
  const bug = live.workOrder.bugs.find((item) => item.id === live.workOrder.activeBugId)!;
  const codePaths = paths.filter((path) => classifyPath(path, live.repoRoot, config) === "code" && !isWorkOrderPath(path, live.repoRoot, config));
  if (codePaths.length === 0) return { action: "allow" };
  const attempts = Number(live.state.attempts[String(bug.id ?? "")] || 0);
  if (attempts >= config.limits.maxFailedFixAttempts) return { action: config.mode === "block" ? "block" : "report", reason: `${String(bug.id)} reached ${attempts} failed fix attempts; move it to architecture-review and record a new decision before further code changes` };
  const firstMutation = Math.min(...live.state.receipts.filter((receipt) => receipt.bugId === bug.id && receipt.kind === "mutation").map(receiptSequence));
  const baseline = live.state.receipts.find((receipt) => receipt.bugId === bug.id && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
  if (!baseline) return { action: config.mode === "block" ? "block" : "report", reason: `${String(bug.id)} has no pre-mutation failing baseline; run the exact reproduction command verbatim, without pipes, redirections, or an echo suffix, and observe its failure` };
  const affected = isRecord(bug.fix) && Array.isArray(bug.fix.affectedBugIds) ? bug.fix.affectedBugIds : [];
  const affectedIds = affected.length > 0 ? affected : [bug.id];
  for (const affectedId of affectedIds) {
    if (affectedId === bug.id) continue;
    const affectedBaseline = live.state.receipts.find((receipt) => receipt.bugId === affectedId && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
    if (!affectedBaseline) return { action: config.mode === "block" ? "block" : "report", reason: `${String(bug.id)} shared fix affected bug ${String(affectedId)} has no attributed failing baseline before the production mutation; switch activeBugId to ${String(affectedId)}, run its exact reproduction verbatim, then switch back` };
  }
  return { action: "allow" };
}

function receiptSequence(receipt: Receipt | undefined): number {
  const matched = /^R-([0-9]+)$/u.exec(String(receipt?.id ?? ""));
  const raw = matched?.[1];
  return raw !== undefined ? Number(raw) : Number.NaN;
}

export function completionFindings(live: RefreshResult | WorkflowRecorded): string[] {
  if (!["active", "inactive"].includes(live.kind)) return live.kind === "idle" ? [] : (live.findings ?? ["work order is unavailable"]);
  if (live.kind !== "active" && live.kind !== "inactive") return live.findings ?? ["work order is unavailable"];
  const { workOrder, state } = live;
  if (workOrder.status !== "closed") return [];
  const findings: string[] = [];
  const mutations = (state.receipts ?? []).filter((receipt) => receipt.kind === "mutation" && receipt.outcome === "success");
  if (mutations.length === 0) return findings;
  const ownersByBug = new Map<unknown, unknown[]>();
  for (const bug of workOrder.bugs) {
    const fix = isRecord(bug.fix) ? bug.fix : undefined;
    const affected = Array.isArray(fix?.affectedBugIds) && fix.affectedBugIds.length > 0 ? fix.affectedBugIds : [bug.id];
    if (!mutations.some((receipt) => receipt.bugId === bug.id)) continue;
    for (const affectedId of affected) {
      const owners = ownersByBug.get(affectedId) ?? [];
      owners.push(bug.id);
      ownersByBug.set(affectedId, owners);
    }
  }
  const bugIds = new Set([...ownersByBug.keys(), ...mutations.map((receipt) => receipt.bugId)]);
  for (const bugId of bugIds) {
    const owners = new Set(ownersByBug.get(bugId) ?? [bugId]);
    const relevantMutations = mutations.filter((receipt) => owners.has(receipt.bugId) || receipt.bugId === bugId);
    if (relevantMutations.length === 0) continue;
    const firstMutation = Math.min(...relevantMutations.map(receiptSequence));
    const lastMutation = Math.max(...relevantMutations.map(receiptSequence));
    const baseline = state.receipts.find((receipt) => receipt.bugId === bugId && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
    if (!baseline) findings.push(`${String(bugId)}: no failing original reproduction was observed before production mutation`);
    const after = state.receipts.filter((receipt) => receipt.bugId === bugId && receiptSequence(receipt) > lastMutation);
    const repro = after.find((receipt) => receipt.kind === "reproduction" && receipt.outcome === "success");
    if (!repro) findings.push(`${String(bugId)}: original reproduction lacks a successful current-session receipt`);
    const bug = workOrder.bugs.find((item) => item.id === bugId);
    const acceptanceCommand = isRecord(bug?.symptom) ? String(bug.symptom.acceptance ?? "").trim() : "";
    const acceptanceHash = acceptanceCommand ? hash(normalizeCommand(acceptanceCommand)) : null;
    const acceptance = acceptanceHash
      ? after.find((receipt) => receipt.commandHash === acceptanceHash && receipt.outcome === "success")
      : undefined;
    if (acceptanceHash && !acceptance) findings.push(`${String(bugId)}: user-visible acceptance command lacks a successful post-mutation receipt`);
    const regression = after.find((receipt) => receipt.id !== repro?.id && receipt.id !== acceptance?.id && receipt.outcome === "success");
    if (!regression) findings.push(`${String(bugId)}: regression verification is missing`);
    const cleanup = after.find((receipt) => receipt.id !== repro?.id && receipt.id !== acceptance?.id && receipt.id !== regression?.id && receipt.outcome !== "failure");
    if (!cleanup) findings.push(`${String(bugId)}: debug-marker cleanup receipt is missing, cross-bug, or failed`);
    if (repro && receiptSequence(repro) <= lastMutation) findings.push(`${String(bugId)}: original reproduction predates the last relevant mutation`);
  }
  return [...new Set(findings)];
}

export function bindAfterWriter({ cwd, sessionId, command = "", stdout = "", config = DEFAULT_CONFIG, now = Date.now() }: BindAfterWriterInput): WriterHookResult {
  const printed = parseWriterStdout(stdout);
  const looksLikeWriter = isOfficialWriterCommand(command) || Boolean(printed?.ok && (printed.id || printed.path));
  if (!looksLikeWriter) return { kind: "idle" };
  const action = writerActionFromCommand(command);
  if (action === "status") return refreshBoundWorkOrder({ cwd, sessionId, config });
  const repoRoot = gitRoot(cwd);
  const touched: string[] = [];
  if (typeof printed?.path === "string") touched.push(printed.path);
  else if (printed?.path) touched.push(String(printed.path));
  const slug = commandFlag(command, "slug");
  if (slug) touched.push(resolve(repoRoot, config.ledger.root, slug));
  if (printed?.id) {
    const dir = findLedgerDir(repoRoot, config, printed.id);
    if (dir) touched.push(dir);
  }
  if (touched.length === 0) {
    const open = scanLedgers(repoRoot, config).filter((item) => item.store === "events");
    if (open.length === 1) {
      const only = open[0];
      if (only) touched.push(only.path);
    }
  }
  if (touched.length === 0) return { kind: "idle" };
  return bindWorkOrderAfterMutation({ cwd, sessionId, touchedPaths: touched, config, now });
}

export function closeBinding({ cwd, sessionId, config = DEFAULT_CONFIG }: RefreshInput): RefreshResult {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (!["active", "inactive"].includes(live.kind)) return live;
  if (live.kind !== "active" && live.kind !== "inactive") return live;
  if (["closed", "aborted", "paused"].includes(String(live.workOrder.status))) releaseLease({ repoRoot: live.repoRoot, workOrderId: String(live.workOrder.id ?? ""), sessionId });
  return live;
}
