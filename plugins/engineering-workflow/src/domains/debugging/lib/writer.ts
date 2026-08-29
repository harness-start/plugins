import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { appendRecord } from "@harness/core/jsonl-trail";
import { isRecord } from "@harness/core/hook-event";

import { DEFAULT_CONFIG, type PluginConfig } from "./config.js";
import { findLedgerDir, foldWorkOrder, loadIntentFile, loadLedger, readEventLog, scanLedgers, type LedgerLoadValid } from "./ledger.js";
import type { WorkOrder } from "./work-order.js";

export type WriterInput = {
  cwd?: string | undefined;
  id?: unknown;
  slug?: unknown;
  summary?: unknown;
  userOutcome?: unknown;
  expected?: unknown;
  actual?: unknown;
  reproduction?: unknown;
  acceptance?: unknown;
  environment?: unknown;
  h1?: unknown;
  h1Falsifier?: unknown;
  h2?: unknown;
  h2Falsifier?: unknown;
  goal?: unknown;
  mode?: unknown;
  bugId?: unknown;
  priority?: unknown;
  config?: PluginConfig | undefined;
  now?: number | undefined;
  event?: Record<string, unknown> | undefined;
  hypothesisId?: unknown;
  status?: unknown;
  receiptIds?: unknown;
  receiptId?: unknown;
  statement?: unknown;
  causalChain?: unknown;
  chain?: unknown;
  affectedBugIds?: unknown;
  bugs?: unknown;
  bug?: Record<string, unknown> | undefined;
  nextAction?: unknown;
  nextBugId?: unknown;
  recoveryCommands?: unknown;
  recovery?: unknown;
  architectureReview?: unknown;
  bugStatus?: unknown;
};

export type WriterResult = {
  ok: boolean;
  error?: string | undefined;
  id?: string | undefined;
  path?: string | undefined;
  workOrder?: WorkOrder | null | undefined;
  slug?: string | undefined;
  intent?: Record<string, unknown> | undefined;
  events?: unknown;
  config?: PluginConfig | undefined;
  cwd?: string | undefined;
  repoRoot?: string | undefined;
  now?: number | undefined;
};

type WriterContext = {
  config: PluginConfig;
  cwd: string;
  repoRoot: string;
  now: number;
};

type ResolveExisting =
  | (WriterContext & { ok: true; dir: string; loaded: LedgerLoadValid })
  | (WriterContext & { ok: false; error: string; path?: string });

function gitRoot(cwd: string): string {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    return resolve(cwd, relative(realpathSync(cwd), realpathSync(top)));
  }
  catch { return resolve(cwd); }
}

function sanitizeSlug(value: unknown): string {
  const slug = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48);
  return slug || "debug";
}

function yyyymmdd(now: number): string {
  const date = new Date(now);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function ensureExclude(root: string, config: PluginConfig): void {
  if (config.ledger.persistence !== "local") return;
  try {
    const path = execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    const absolute = resolve(root, path);
    const entry = `/${config.ledger.root}/`;
    const existing = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
    if (!existing.split(/\r?\n/u).includes(entry)) {
      appendFileSync(absolute, `${existing && !existing.endsWith("\n") ? "\n" : ""}${entry}\n`, "utf8");
    }
  } catch {}
}

function defaultHypotheses(input: WriterInput): Array<{ id: string; statement: string; falsifier: string }> {
  return [
    {
      id: "H1",
      statement: String(input.h1 ?? "").trim() || "the reported failure has a specific causal defect",
      falsifier: String(input.h1Falsifier ?? "").trim() || "the exact reproduction succeeds without a code change",
    },
    {
      id: "H2",
      statement: String(input.h2 ?? "").trim() || "the failure is environmental or fixture-related",
      falsifier: String(input.h2Falsifier ?? "").trim() || "the same reproduction fails in a clean environment",
    },
  ];
}

function context(input: WriterInput): WriterContext {
  const config = input.config ?? DEFAULT_CONFIG;
  const cwd = resolve(input.cwd || process.cwd());
  return { config, cwd, repoRoot: gitRoot(cwd), now: input.now ?? Date.now() };
}

function resultOf(loaded: LedgerLoadValid, extra: Record<string, unknown> = {}): WriterResult {
  return {
    ok: true,
    id: String(loaded.workOrder.id ?? ""),
    path: loaded.path,
    workOrder: loaded.workOrder,
    ...extra,
  };
}

function defaultOpenDir(repoRoot: string, config: PluginConfig): string | null {
  const items = scanLedgers(repoRoot, config).filter((item) => item.store === "events");
  const open = items.filter((item) => item.workOrder.status === "open");
  if (open.length === 1) return open[0]?.path ?? null;
  return items.length === 1 ? items[0]?.path ?? null : null;
}

function resolveExisting(input: WriterInput): ResolveExisting {
  const ctx = context(input);
  const id = String(input.id ?? "").trim();
  const dir = id ? findLedgerDir(ctx.repoRoot, ctx.config, id) : defaultOpenDir(ctx.repoRoot, ctx.config);
  if (!dir) return { ...ctx, ok: false, error: id ? `ledger not found: ${id}` : "no open debug ledger; run init first" };
  const loaded = loadLedger(dir, ctx.config);
  if (!loaded.valid) return { ...ctx, ok: false, error: (loaded.findings ?? []).join("; "), path: dir };
  return { ...ctx, ok: true, dir, loaded };
}

function appendEvent(dir: string, event: Record<string, unknown>): void {
  appendRecord(join(dir, "events.jsonl"), event);
}

function reload(dir: string, config: PluginConfig) {
  return loadLedger(dir, config);
}

export function initLedger(input: WriterInput): WriterResult {
  const ctx = context(input);
  const slug = sanitizeSlug(input.slug || input.summary);
  const id = String(input.id ?? "").trim() || `DWO-${yyyymmdd(ctx.now)}-${slug}`;
  if (!/^DWO-[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(id)) return { ok: false, error: "id must match DWO-<stable-id>" };
  const summary = String(input.summary ?? "").trim();
  const actual = String(input.actual ?? "").trim();
  const reproduction = String(input.reproduction ?? "").trim();
  if (!summary || !actual || !reproduction) return { ok: false, error: "summary, actual, and reproduction are required" };
  const dir = join(ctx.repoRoot, ctx.config.ledger.root, slug);
  if (existsSync(join(dir, "intent.json"))) return { ok: false, error: `ledger already exists: ${dir}`, path: dir, id };
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const bugId = String(input.bugId ?? "BUG-001");
  const intent = {
    schema: "debug-work-order/v1",
    id,
    createdAt: ctx.now,
    run: { epoch: 1, mode: input.mode === "investigate-only" ? "investigate-only" : "investigate-and-fix" },
    bugs: [{
      id: bugId,
      summary,
      goal: input.goal === "diagnose" ? "diagnose" : "fix",
      priority: input.priority || "high",
      dependsOn: [],
      duplicateOf: null,
      rootCauseGroup: null,
      symptom: {
        userOutcome: String(input.userOutcome ?? "").trim() || undefined,
        expected: String(input.expected ?? "").trim() || "observable expected behavior",
        actual,
        reproduction,
        acceptance: String(input.acceptance ?? "").trim() || undefined,
        environment: String(input.environment ?? "").trim() || "local",
      },
      hypotheses: defaultHypotheses(input),
    }],
  };
  writeFileSync(join(dir, "intent.json"), `${JSON.stringify(intent, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  appendEvent(dir, { v: 1, t: "opened", at: ctx.now, id, mode: intent.run.mode, epoch: 1 });
  appendEvent(dir, { v: 1, t: "activate", at: ctx.now, bugId });
  ensureExclude(ctx.repoRoot, ctx.config);
  const loaded = reload(dir, ctx.config);
  if (!loaded.valid) return { ok: false, error: (loaded.findings ?? []).join("; "), path: dir, id };
  return resultOf(loaded, { slug, intent, events: loaded.events });
}

export function appendLedgerEvent(input: WriterInput): WriterResult {
  const existing = resolveExisting(input);
  if (!existing.ok) return existing;
  appendEvent(existing.dir, { v: 1, at: existing.now, ...input.event });
  const loaded = reload(existing.dir, existing.config);
  return loaded.valid ? resultOf(loaded) : { ok: false, error: (loaded.findings ?? []).join("; "), path: existing.dir };
}

export function activateBug(input: WriterInput): WriterResult {
  const bugId = String(input.bugId ?? "").trim();
  if (!bugId) return { ok: false, error: "bugId is required" };
  return appendLedgerEvent({ ...input, event: { t: "activate", bugId } });
}

export function claimHypothesis(input: WriterInput): WriterResult {
  const bugId = String(input.bugId ?? "").trim();
  const hypothesisId = String(input.hypothesisId ?? "").trim();
  const status = String(input.status ?? "").trim();
  const receiptId = String(input.receiptId ?? "").trim();
  if (!bugId || !/^H[0-9]+$/u.test(hypothesisId) || !["open", "supported", "falsified"].includes(status) || !/^R-[0-9]+$/u.test(receiptId)) {
    return { ok: false, error: "bugId, hypothesisId, status, and receiptId are required" };
  }
  return appendLedgerEvent({
    ...input,
    event: {
      t: "claim",
      kind: "hypothesis",
      bugId,
      hypothesisId,
      status,
      receiptIds: input.receiptIds ?? [receiptId],
    },
  });
}

export function claimRootCause(input: WriterInput): WriterResult {
  const chain = Array.isArray(input.causalChain)
    ? input.causalChain
    : String(input.chain ?? "").split("|").map((item) => item.trim()).filter(Boolean);
  const bugId = String(input.bugId ?? "").trim();
  const statement = String(input.statement ?? "").trim();
  const receiptId = String(input.receiptId ?? "").trim();
  if (!bugId || !statement || chain.length < 1 || !/^R-[0-9]+$/u.test(receiptId)) {
    return { ok: false, error: "bugId, statement, causalChain, and receiptId are required" };
  }
  return appendLedgerEvent({
    ...input,
    event: {
      t: "claim",
      kind: "root-cause",
      bugId,
      statement,
      causalChain: chain,
      receiptIds: input.receiptIds ?? [receiptId],
    },
  });
}

export function affectBugs(input: WriterInput): WriterResult {
  const affectedBugIds = Array.isArray(input.affectedBugIds)
    ? input.affectedBugIds
    : String(input.bugs ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (affectedBugIds.length < 1) return { ok: false, error: "affectedBugIds is required" };
  return appendLedgerEvent({ ...input, event: { t: "affect", bugId: input.bugId, affectedBugIds } });
}

export function addBug(input: WriterInput): WriterResult {
  const bug = input.bug ?? {
    id: input.bugId,
    summary: input.summary,
    goal: input.goal === "diagnose" ? "diagnose" : "fix",
    priority: input.priority || "high",
    dependsOn: [],
    duplicateOf: null,
    rootCauseGroup: null,
    symptom: {
      userOutcome: input.userOutcome,
      expected: input.expected || "observable expected behavior",
      actual: input.actual,
      reproduction: input.reproduction,
      acceptance: input.acceptance,
      environment: input.environment || "local",
    },
    hypotheses: defaultHypotheses(input),
  };
  const symptom = isRecord(bug.symptom) ? bug.symptom : undefined;
  if (!bug.id || !bug.summary || !symptom?.actual || !symptom?.reproduction) {
    return { ok: false, error: "add-bug requires id, summary, actual, and reproduction" };
  }
  return appendLedgerEvent({ ...input, event: { t: "queued-bug", bug } });
}

export function pauseLedger(input: WriterInput): WriterResult {
  const nextAction = String(input.nextAction ?? "").trim();
  if (!nextAction) return { ok: false, error: "nextAction is required" };
  return appendLedgerEvent({
    ...input,
    event: {
      t: "pause",
      nextAction,
      nextBugId: input.nextBugId ?? input.bugId ?? null,
      recoveryCommands: input.recoveryCommands ?? (input.recovery ? [input.recovery] : []),
      architectureReview: Boolean(input.architectureReview),
      bugStatus: input.architectureReview ? "architecture-review" : input.bugStatus,
    },
  });
}

export function closeLedger(input: WriterInput): WriterResult {
  return appendLedgerEvent({ ...input, event: { t: "close" } });
}

export function abortLedger(input: WriterInput): WriterResult {
  return appendLedgerEvent({ ...input, event: { t: "abort" } });
}

export function resumeLedger(input: WriterInput): WriterResult {
  const existing = resolveExisting(input);
  if (!existing.ok) return existing;
  const epoch = Number(existing.loaded.workOrder.run?.epoch) + 1;
  return appendLedgerEvent({
    ...input,
    event: { t: "resume", epoch, bugId: input.bugId || existing.loaded.workOrder.resume?.nextBugId },
  });
}

export function statusLedger(input: WriterInput): WriterResult {
  const existing = resolveExisting(input);
  if (!existing.ok) return existing;
  return resultOf(existing.loaded);
}

export function inspectIntent(input: WriterInput): WriterResult & { intent?: unknown } {
  const existing = resolveExisting(input);
  if (!existing.ok) return existing;
  const events = readEventLog(existing.dir);
  const intent = loadIntentFile(existing.dir).value;
  return {
    ok: true,
    intent,
    events,
    workOrder: foldWorkOrder({ intent, events: Array.isArray(events) ? events : [] }) ?? undefined,
  };
}
