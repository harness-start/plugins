import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";

import { DEFAULT_CONFIG } from "./config.mjs";
import { acquireLease, emptyState, readState, releaseLease, writeState } from "./state-store.mjs";
import { isWorkOrderPath, loadWorkOrder } from "./work-order.mjs";

function gitRoot(cwd) {
  try { return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return resolve(cwd); }
}

export function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }
export function normalizeCommand(command) { return String(command ?? "").trim().replace(/\s+/gu, " "); }

function safeRegex(pattern) {
  try { return new RegExp(pattern, "u"); } catch { return null; }
}

function matchesAny(value, patterns) { return patterns.some((pattern) => safeRegex(pattern)?.test(value)); }

export function configuredOutcome(command, observed, config) {
  const normalized = normalizeCommand(command);
  if (matchesAny(normalized, config.commands.expectedFailurePatterns)) return "failure";
  if (matchesAny(normalized, config.commands.expectedSuccessPatterns)) return "success";
  return observed;
}

export function classifyCommand(command, bug, config) {
  const normalized = normalizeCommand(command);
  if (normalizeCommand(bug?.symptom?.reproduction) === normalized || matchesAny(normalized, config.commands.reproductionPatterns)) return "reproduction";
  if (matchesAny(normalized, config.commands.verificationPatterns) || /(?:^|\s)(?:test|tests|pytest|phpunit|rspec|cargo test|go test|npm test|pnpm test|yarn test|mvn test|gradle test)(?:\s|$)/iu.test(normalized)) return "verification";
  return "command";
}

export function classifyPath(path, repoRoot, config) {
  const rel = relative(repoRoot, resolve(path)).replaceAll("\\", "/");
  const groups = config.paths;
  if (matchesAny(rel, groups.nonCodePatterns)) return "non-code";
  if (matchesAny(rel, groups.diagnosticPatterns) || /(?:^|\/)(?:tmp|temp|debug|diagnostics?)(?:\/|$)/iu.test(rel)) return "diagnostic";
  if (matchesAny(rel, groups.testPatterns) || /(?:^|\/)(?:test|tests|spec|specs|__tests__)(?:\/|$)|(?:\.test|\.spec)\.[^.]+$/iu.test(rel)) return "test";
  if (matchesAny(rel, groups.codePatterns)) return "code";
  if (/\.(?:md|txt|rst|adoc|png|jpe?g|gif|svg|pdf)$/iu.test(rel)) return "non-code";
  return "code";
}

export function bindWorkOrderAfterMutation({ cwd, sessionId, touchedPaths, config = DEFAULT_CONFIG, now = Date.now() }) {
  const repoRoot = gitRoot(cwd);
  const candidates = [...new Set(touchedPaths)].filter((path) => isWorkOrderPath(path, repoRoot, config));
  if (candidates.length === 0) return { kind: "idle" };
  if (candidates.length > 1) return { kind: "invalid", findings: ["one hook event cannot bind multiple work orders"] };
  const existing = readState(sessionId, repoRoot);
  if (existing.bound && existing.workOrderPath !== candidates[0]) return { kind: "conflict", path: candidates[0], findings: [`this session is already bound to ${relative(repoRoot, existing.workOrderPath)}`] };
  const checked = loadWorkOrder(candidates[0], config);
  if (!checked.valid) {
    const state = {
      ...(existing.bound ? existing : emptyState()),
      bound: true,
      workOrderPath: candidates[0],
      invalid: true,
      eventSeq: existing.bound ? existing.eventSeq + 1 : 1,
      updatedAt: now,
    };
    writeState(sessionId, repoRoot, state);
    return { kind: "invalid", repoRoot, state, path: candidates[0], findings: checked.findings };
  }
  const workOrder = checked.workOrder;
  if (existing.bound && existing.workOrderId && (existing.workOrderId !== workOrder.id || existing.epoch !== workOrder.run.epoch)) {
    existing.invalid = true;
    existing.eventSeq += 1;
    writeState(sessionId, repoRoot, existing);
    return { kind: "invalid", repoRoot, state: existing, path: candidates[0], findings: ["a corrected bound work order must preserve its id and run.epoch"] };
  }
  const active = workOrder.status === "open" && workOrder.run.state === "active";
  if (active) {
    const lease = acquireLease({ repoRoot, workOrderId: workOrder.id, epoch: workOrder.run.epoch, sessionId, leaseMinutes: config.limits.leaseMinutes, now });
    if (!lease.ok) return { kind: "conflict", path: candidates[0], findings: [lease.reason] };
  }
  const state = {
    ...(existing.bound ? existing : emptyState()),
    bound: true,
    workOrderPath: candidates[0],
    workOrderId: workOrder.id,
    epoch: workOrder.run.epoch,
    activeBugId: workOrder.activeBugId,
    revision: existing.bound ? existing.revision + 1 : 1,
    eventSeq: existing.bound ? existing.eventSeq + 1 : 1,
    invalid: false,
    updatedAt: now,
  };
  writeState(sessionId, repoRoot, state);
  return { kind: "bound", repoRoot, workOrder, state, active };
}

export function refreshBoundWorkOrder({ cwd, sessionId, config = DEFAULT_CONFIG }) {
  const repoRoot = gitRoot(cwd);
  const state = readState(sessionId, repoRoot);
  if (!state.bound || !state.workOrderPath) return { kind: "idle", repoRoot, state };
  const checked = loadWorkOrder(state.workOrderPath, config);
  if (!checked.valid) {
    state.invalid = true;
    writeState(sessionId, repoRoot, state);
    return { kind: "invalid", repoRoot, state, findings: checked.findings };
  }
  if (checked.workOrder.id !== state.workOrderId || checked.workOrder.run.epoch !== state.epoch) return { kind: "invalid", repoRoot, state, findings: ["bound work-order id or run.epoch changed unexpectedly"] };
  state.invalid = false;
  state.activeBugId = checked.workOrder.activeBugId;
  if (checked.workOrder.status !== "open" || checked.workOrder.run.state !== "active") {
    return { kind: "inactive", repoRoot, state, workOrder: checked.workOrder };
  }
  return { kind: "active", repoRoot, state, workOrder: checked.workOrder };
}

export function recordReceipt({ cwd, sessionId, config = DEFAULT_CONFIG, kind, command = null, paths = [], outcome = null, summary = "", now = Date.now() }) {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (live.kind !== "active") return live;
  const bug = live.workOrder.bugs.find((item) => item.id === live.workOrder.activeBugId);
  live.state.eventSeq += 1;
  if (kind === "mutation") live.state.mutationSeq = live.state.eventSeq;
  const receipt = {
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
  if (receipt.kind === "reproduction" && outcome === "failure" && receipt.mutationSeq > 0) {
    live.state.attempts[bug.id] = Number(live.state.attempts[bug.id] || 0) + 1;
  }
  live.state.receipts = live.state.receipts.slice(-config.limits.maxReceipts);
  writeState(sessionId, live.repoRoot, live.state);
  return { ...live, kind: "recorded", receipt };
}

export function preMutationDecision({ cwd, sessionId, paths, config = DEFAULT_CONFIG }) {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (["idle", "inactive"].includes(live.kind)) return { action: "allow", reason: "no active bound work order" };
  if (live.kind === "invalid" && live.state?.workOrderPath && paths.length > 0 && paths.every((path) => resolve(path) === resolve(live.state.workOrderPath))) {
    return { action: "allow", reason: "allowing correction of the invalid bound work order" };
  }
  if (live.kind !== "active") return { action: config.mode === "block" ? "block" : "report", reason: `bound work order is invalid: ${(live.findings ?? []).join("; ")}` };
  const bug = live.workOrder.bugs.find((item) => item.id === live.workOrder.activeBugId);
  const codePaths = paths.filter((path) => classifyPath(path, live.repoRoot, config) === "code" && !isWorkOrderPath(path, live.repoRoot, config));
  if (codePaths.length === 0) return { action: "allow" };
  const attempts = Number(live.state.attempts[bug.id] || 0);
  if (attempts >= config.limits.maxFailedFixAttempts) return { action: config.mode === "block" ? "block" : "report", reason: `${bug.id} reached ${attempts} failed fix attempts; move it to architecture-review and record a new decision before further code changes` };
  const firstMutation = Math.min(...live.state.receipts.filter((receipt) => receipt.bugId === bug.id && receipt.kind === "mutation").map(receiptSequence));
  const baseline = live.state.receipts.find((receipt) => receipt.bugId === bug.id && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
  if (!baseline) return { action: config.mode === "block" ? "block" : "report", reason: `${bug.id} has no pre-mutation failing baseline; run the exact reproduction command verbatim, without pipes, redirections, or an echo suffix, and observe its failure` };
  const supported = bug.hypotheses.find((hypothesis) => hypothesis.status === "supported" && hypothesis.evidenceRefs.length > 0 && hypothesis.evidenceRefs.every((reference) => receiptById(live.state, reference)?.bugId === bug.id));
  const rooted = bug.rootCause.status === "supported" && bug.rootCause.evidenceRefs.length > 0 && bug.rootCause.evidenceRefs.every((reference) => receiptById(live.state, reference)?.bugId === bug.id);
  if (!supported || !rooted) return { action: config.mode === "block" ? "block" : "report", reason: `${bug.id} needs a supported hypothesis and root cause backed by current-session receipts for this bug before production-code writes` };
  if (bug.status !== "fixing" || bug.fix.status !== "in-progress") return { action: config.mode === "block" ? "block" : "report", reason: `${bug.id} must be bug status fixing with fix.status in-progress before production-code writes` };
  if (!bug.fix.affectedBugIds.includes(bug.id)) return { action: config.mode === "block" ? "block" : "report", reason: `${bug.id} must include itself in fix.affectedBugIds before production-code writes` };
  for (const affectedId of bug.fix.affectedBugIds) {
    const affectedBaseline = live.state.receipts.find((receipt) => receipt.bugId === affectedId && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
    if (!affectedBaseline) return { action: config.mode === "block" ? "block" : "report", reason: `${bug.id} shared fix affected bug ${affectedId} has no attributed failing baseline before the production mutation; switch activeBugId to ${affectedId}, run its exact reproduction verbatim, then switch back` };
  }
  return { action: "allow" };
}

function receiptById(state, reference) {
  const id = typeof reference === "string" ? reference : reference?.receiptId;
  return state.receipts.find((receipt) => receipt.id === id);
}

function receiptSequence(receipt) {
  const matched = /^R-([0-9]+)$/u.exec(String(receipt?.id ?? ""));
  return matched ? Number(matched[1]) : Number.NaN;
}

export function completionFindings(live) {
  const findings = [];
  if (!["active", "inactive"].includes(live.kind)) return live.kind === "idle" ? [] : (live.findings ?? ["work order is unavailable"]);
  const { workOrder, state } = live;
  const byId = new Map(workOrder.bugs.map((bug) => [bug.id, bug]));
  for (const owner of workOrder.bugs) {
    for (const affectedId of owner.fix.affectedBugIds) {
      if (byId.get(affectedId)?.status !== "resolved") findings.push(`${owner.id}: affected bug ${affectedId} is not resolved with its own verification`);
    }
  }
  for (const bug of workOrder.bugs) {
    if (bug.status !== "resolved") continue;
    const repro = receiptById(state, bug.verification.originalReproduction);
    const owners = workOrder.bugs.filter((owner) => owner.fix.affectedBugIds.includes(bug.id));
    const validOwners = owners.filter((owner) => {
      const mutation = receiptById(state, owner.fix.firstRevision);
      return owner.fix.status === "applied" && mutation?.kind === "mutation" && mutation.outcome === "success" && mutation.bugId === owner.id;
    });
    if (validOwners.length === 0) findings.push(`${bug.id}: no applied fix mutation receipt affects this bug`);
    const ownerIds = new Set(validOwners.map((owner) => owner.id));
    const relevantMutations = state.receipts.filter((receipt) => receipt.kind === "mutation" && receipt.outcome === "success" && ownerIds.has(receipt.bugId));
    const firstMutation = Math.min(...relevantMutations.map(receiptSequence));
    const lastMutation = Math.max(...relevantMutations.map(receiptSequence));
    const baseline = state.receipts.find((receipt) => receipt.bugId === bug.id && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
    if (!baseline) findings.push(`${bug.id}: no failing original reproduction was observed before production mutation`);
    if (!repro || repro.bugId !== bug.id || repro.kind !== "reproduction" || repro.outcome !== "success") findings.push(`${bug.id}: original reproduction lacks a successful current-session receipt`);
    const supported = bug.hypotheses.find((item) => item.status === "supported" && item.evidenceRefs.length > 0);
    if (!supported) findings.push(`${bug.id}: no supported hypothesis with evidence`);
    else if (supported.evidenceRefs.some((reference) => !receiptById(state, reference) || receiptById(state, reference).bugId !== bug.id)) findings.push(`${bug.id}: supported hypothesis cites stale, forged, or cross-bug evidence`);
    if (bug.rootCause.status !== "supported") findings.push(`${bug.id}: root cause is not supported`);
    else if (bug.rootCause.evidenceRefs.some((reference) => !receiptById(state, reference) || receiptById(state, reference).bugId !== bug.id)) findings.push(`${bug.id}: root cause cites stale, forged, or cross-bug evidence`);
    if (!Array.isArray(bug.verification.regression) || bug.verification.regression.length < 1) findings.push(`${bug.id}: regression verification is missing`);
    else for (const reference of bug.verification.regression) {
      const receipt = receiptById(state, reference);
      if (!receipt || receipt.bugId !== bug.id || receipt.outcome !== "success") findings.push(`${bug.id}: regression receipt is missing, stale, or belongs to another bug`);
    }
    const cleanup = receiptById(state, bug.verification.debugCleanup);
    if (!cleanup || cleanup.bugId !== bug.id || cleanup.outcome === "failure") findings.push(`${bug.id}: debug-marker cleanup receipt is missing, cross-bug, or failed`);
    if (repro && relevantMutations.length > 0 && receiptSequence(repro) < lastMutation) findings.push(`${bug.id}: original reproduction predates the last relevant mutation`);
  }
  if (workOrder.status === "closed" && workOrder.bugs.some((bug) => !["resolved", "blocked", "deferred", "duplicate", "architecture-review"].includes(bug.status))) findings.push("closed work order still has non-terminal bugs");
  return [...new Set(findings)];
}

export function closeBinding({ cwd, sessionId, config = DEFAULT_CONFIG }) {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (!["active", "inactive"].includes(live.kind)) return live;
  if (["closed", "aborted", "paused"].includes(live.workOrder.status)) releaseLease({ repoRoot: live.repoRoot, workOrderId: live.workOrder.id, sessionId });
  return live;
}
