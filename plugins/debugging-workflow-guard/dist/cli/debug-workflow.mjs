#!/usr/bin/env node
// harness-source-hash: sha256:68374c14b70cc17da60e212865c30b54d35ffc8941453b439e418a08b1a42b61
import {
  DEFAULT_CONFIG,
  findLedgerDir,
  isRecord,
  loadLedger,
  scanLedgers
} from "../chunks/chunk-CSCGDWJM.mjs";

// plugins/debugging-workflow-guard/src/entries/cli/debug-workflow.ts
import { resolve as resolve3 } from "node:path";
import { fileURLToPath } from "node:url";

// plugins/debugging-workflow-guard/src/lib/writer.ts
import { execFileSync } from "node:child_process";
import { appendFileSync as appendFileSync2, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join2, resolve as resolve2 } from "node:path";

// core/src/jsonl-trail.ts
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
var LOCK_STALE_MS = 1e4;
var LOCK_RETRIES = 40;
var LOCK_WAIT_MS = 25;
function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
  }
}
function acquireLock(sessionPath) {
  const lockPath = `${sessionPath}.lock`;
  mkdirSync(dirname(sessionPath), { recursive: true, mode: 448 });
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    try {
      const fd = openSync(lockPath, "wx", 384);
      writeSync(fd, `${process.pid}
${Date.now()}
`);
      return { fd, lockPath };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const raw = readFileSync(lockPath, "utf8");
        const ts = Number(raw.split("\n")[1] ?? 0);
        if (Number.isFinite(ts) && Date.now() - ts > LOCK_STALE_MS) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
      }
      sleepMs(LOCK_WAIT_MS);
    }
  }
  return null;
}
function releaseLock(lock) {
  if (!lock) return;
  try {
    closeSync(lock.fd);
  } catch {
  }
  try {
    unlinkSync(lock.lockPath);
  } catch {
  }
}
function appendRecord(sessionPath, record) {
  mkdirSync(dirname(sessionPath), { recursive: true, mode: 448 });
  const line = `${JSON.stringify(record)}
`;
  const lock = acquireLock(sessionPath);
  try {
    const flag = existsSync(sessionPath) ? "a" : "ax";
    try {
      appendFileSync(sessionPath, line, { encoding: "utf8", mode: 384, flag });
    } catch {
      appendFileSync(sessionPath, line, { encoding: "utf8", mode: 384 });
    }
  } finally {
    releaseLock(lock);
  }
  return sessionPath;
}

// plugins/debugging-workflow-guard/src/lib/writer.ts
function gitRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return resolve2(cwd);
  }
}
function sanitizeSlug(value) {
  const slug = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48);
  return slug || "debug";
}
function yyyymmdd(now) {
  const date = new Date(now);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
function ensureExclude(root, config) {
  if (config.ledger.persistence !== "local") return;
  try {
    const path = execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root, encoding: "utf8", timeout: 5e3 }).trim();
    const absolute = resolve2(root, path);
    const entry = `/${config.ledger.root}/`;
    const existing = existsSync2(absolute) ? readFileSync2(absolute, "utf8") : "";
    if (!existing.split(/\r?\n/u).includes(entry)) {
      appendFileSync2(absolute, `${existing && !existing.endsWith("\n") ? "\n" : ""}${entry}
`, "utf8");
    }
  } catch {
  }
}
function defaultHypotheses(input) {
  return [
    {
      id: "H1",
      statement: String(input.h1 ?? "").trim() || "the reported failure has a specific causal defect",
      falsifier: String(input.h1Falsifier ?? "").trim() || "the exact reproduction succeeds without a code change"
    },
    {
      id: "H2",
      statement: String(input.h2 ?? "").trim() || "the failure is environmental or fixture-related",
      falsifier: String(input.h2Falsifier ?? "").trim() || "the same reproduction fails in a clean environment"
    }
  ];
}
function context(input) {
  const config = input.config ?? DEFAULT_CONFIG;
  const cwd = resolve2(input.cwd || process.cwd());
  return { config, cwd, repoRoot: gitRoot(cwd), now: input.now ?? Date.now() };
}
function resultOf(loaded, extra = {}) {
  return {
    ok: true,
    id: String(loaded.workOrder.id ?? ""),
    path: loaded.path,
    workOrder: loaded.workOrder,
    ...extra
  };
}
function defaultOpenDir(repoRoot, config) {
  const items = scanLedgers(repoRoot, config).filter((item) => item.store === "events");
  const open = items.filter((item) => item.workOrder.status === "open");
  if (open.length === 1) return open[0]?.path ?? null;
  return items.length === 1 ? items[0]?.path ?? null : null;
}
function resolveExisting(input) {
  const ctx = context(input);
  const id = String(input.id ?? "").trim();
  const dir = id ? findLedgerDir(ctx.repoRoot, ctx.config, id) : defaultOpenDir(ctx.repoRoot, ctx.config);
  if (!dir) return { ...ctx, ok: false, error: id ? `ledger not found: ${id}` : "no open debug ledger; run init first" };
  const loaded = loadLedger(dir, ctx.config);
  if (!loaded.valid) return { ...ctx, ok: false, error: (loaded.findings ?? []).join("; "), path: dir };
  return { ...ctx, ok: true, dir, loaded };
}
function appendEvent(dir, event) {
  appendRecord(join2(dir, "events.jsonl"), event);
}
function reload(dir, config) {
  return loadLedger(dir, config);
}
function initLedger(input) {
  const ctx = context(input);
  const slug = sanitizeSlug(input.slug || input.summary);
  const id = String(input.id ?? "").trim() || `DWO-${yyyymmdd(ctx.now)}-${slug}`;
  if (!/^DWO-[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(id)) return { ok: false, error: "id must match DWO-<stable-id>" };
  const summary = String(input.summary ?? "").trim();
  const actual = String(input.actual ?? "").trim();
  const reproduction = String(input.reproduction ?? "").trim();
  if (!summary || !actual || !reproduction) return { ok: false, error: "summary, actual, and reproduction are required" };
  const dir = join2(ctx.repoRoot, ctx.config.ledger.root, slug);
  if (existsSync2(join2(dir, "intent.json"))) return { ok: false, error: `ledger already exists: ${dir}`, path: dir, id };
  mkdirSync2(dir, { recursive: true, mode: 448 });
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
        expected: String(input.expected ?? "").trim() || "observable expected behavior",
        actual,
        reproduction,
        environment: String(input.environment ?? "").trim() || "local"
      },
      hypotheses: defaultHypotheses(input)
    }]
  };
  writeFileSync2(join2(dir, "intent.json"), `${JSON.stringify(intent, null, 2)}
`, { encoding: "utf8", mode: 384, flag: "wx" });
  appendEvent(dir, { v: 1, t: "opened", at: ctx.now, id, mode: intent.run.mode, epoch: 1 });
  appendEvent(dir, { v: 1, t: "activate", at: ctx.now, bugId });
  ensureExclude(ctx.repoRoot, ctx.config);
  const loaded = reload(dir, ctx.config);
  if (!loaded.valid) return { ok: false, error: (loaded.findings ?? []).join("; "), path: dir, id };
  return resultOf(loaded, { slug, intent, events: loaded.events });
}
function appendLedgerEvent(input) {
  const existing = resolveExisting(input);
  if (!existing.ok) return existing;
  appendEvent(existing.dir, { v: 1, at: existing.now, ...input.event });
  const loaded = reload(existing.dir, existing.config);
  return loaded.valid ? resultOf(loaded) : { ok: false, error: (loaded.findings ?? []).join("; "), path: existing.dir };
}
function activateBug(input) {
  const bugId = String(input.bugId ?? "").trim();
  if (!bugId) return { ok: false, error: "bugId is required" };
  return appendLedgerEvent({ ...input, event: { t: "activate", bugId } });
}
function claimHypothesis(input) {
  return appendLedgerEvent({
    ...input,
    event: {
      t: "claim",
      kind: "hypothesis",
      bugId: input.bugId,
      hypothesisId: input.hypothesisId,
      status: input.status,
      receiptIds: input.receiptIds ?? (input.receiptId ? [input.receiptId] : [])
    }
  });
}
function claimRootCause(input) {
  const chain = Array.isArray(input.causalChain) ? input.causalChain : String(input.chain ?? "").split("|").map((item) => item.trim()).filter(Boolean);
  return appendLedgerEvent({
    ...input,
    event: {
      t: "claim",
      kind: "root-cause",
      bugId: input.bugId,
      statement: input.statement,
      causalChain: chain,
      receiptIds: input.receiptIds ?? (input.receiptId ? [input.receiptId] : [])
    }
  });
}
function affectBugs(input) {
  const affectedBugIds = Array.isArray(input.affectedBugIds) ? input.affectedBugIds : String(input.bugs ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (affectedBugIds.length < 1) return { ok: false, error: "affectedBugIds is required" };
  return appendLedgerEvent({ ...input, event: { t: "affect", bugId: input.bugId, affectedBugIds } });
}
function addBug(input) {
  const bug = input.bug ?? {
    id: input.bugId,
    summary: input.summary,
    goal: input.goal === "diagnose" ? "diagnose" : "fix",
    priority: input.priority || "high",
    dependsOn: [],
    duplicateOf: null,
    rootCauseGroup: null,
    symptom: {
      expected: input.expected || "observable expected behavior",
      actual: input.actual,
      reproduction: input.reproduction,
      environment: input.environment || "local"
    },
    hypotheses: defaultHypotheses(input)
  };
  const symptom = isRecord(bug.symptom) ? bug.symptom : void 0;
  if (!bug.id || !bug.summary || !symptom?.actual || !symptom?.reproduction) {
    return { ok: false, error: "add-bug requires id, summary, actual, and reproduction" };
  }
  return appendLedgerEvent({ ...input, event: { t: "queued-bug", bug } });
}
function pauseLedger(input) {
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
      bugStatus: input.architectureReview ? "architecture-review" : input.bugStatus
    }
  });
}
function closeLedger(input) {
  return appendLedgerEvent({ ...input, event: { t: "close" } });
}
function abortLedger(input) {
  return appendLedgerEvent({ ...input, event: { t: "abort" } });
}
function resumeLedger(input) {
  const existing = resolveExisting(input);
  if (!existing.ok) return existing;
  const epoch = Number(existing.loaded.workOrder.run?.epoch) + 1;
  return appendLedgerEvent({
    ...input,
    event: { t: "resume", epoch, bugId: input.bugId || existing.loaded.workOrder.resume?.nextBugId }
  });
}
function statusLedger(input) {
  const existing = resolveExisting(input);
  if (!existing.ok) return existing;
  return resultOf(existing.loaded);
}

// plugins/debugging-workflow-guard/src/entries/cli/debug-workflow.ts
function parseArgs(argv) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === void 0) continue;
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) options[key] = true;
    else {
      options[key] = next;
      index += 1;
    }
  }
  return { options, positionals };
}
function output(value) {
  process.stdout.write(`${JSON.stringify(value)}
`);
}
function fail(error) {
  const message = error instanceof Error ? error.message : error;
  output({ ok: false, error: String(message ?? error) });
  process.exitCode = 1;
}
function list(value) {
  if (Array.isArray(value)) return value;
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}
async function main(argv = process.argv.slice(2)) {
  const { options, positionals } = parseArgs(argv);
  const action = positionals[0];
  const cwd = options.cwd ? resolve3(String(options.cwd)) : process.cwd();
  const base = { cwd, id: options.id, slug: options.slug };
  let result;
  try {
    if (action === "init" || action === "open") {
      result = initLedger({
        ...base,
        summary: options.summary,
        expected: options.expected,
        actual: options.actual,
        reproduction: options.repro || options.reproduction,
        environment: options.environment,
        h1: options.h1,
        h1Falsifier: options["h1-falsifier"],
        h2: options.h2,
        h2Falsifier: options["h2-falsifier"],
        goal: options.goal,
        mode: options.mode,
        bugId: options.bug,
        priority: options.priority
      });
    } else if (action === "activate") {
      result = activateBug({ ...base, bugId: options.bug || options["bug-id"] });
    } else if (action === "claim" && (options["root-cause"] || options.statement)) {
      result = claimRootCause({
        ...base,
        bugId: options.bug,
        statement: options["root-cause"] || options.statement,
        chain: options.chain,
        receiptId: options.receipt
      });
    } else if (action === "claim") {
      result = claimHypothesis({
        ...base,
        bugId: options.bug,
        hypothesisId: options.hypothesis || options.h,
        status: options.status || "supported",
        receiptId: options.receipt
      });
    } else if (action === "affect") {
      result = affectBugs({ ...base, bugId: options.bug, affectedBugIds: list(options.bugs) });
    } else if (action === "add-bug") {
      result = addBug({
        ...base,
        bugId: options.bug || options["bug-id"],
        summary: options.summary,
        expected: options.expected,
        actual: options.actual,
        reproduction: options.repro || options.reproduction,
        environment: options.environment,
        h1: options.h1,
        h1Falsifier: options["h1-falsifier"],
        h2: options.h2,
        h2Falsifier: options["h2-falsifier"],
        goal: options.goal
      });
    } else if (action === "pause") {
      result = pauseLedger({
        ...base,
        nextAction: options.next || options["next-action"],
        nextBugId: options["next-bug"] || options.bug,
        recovery: options.recovery,
        architectureReview: Boolean(options["architecture-review"])
      });
    } else if (action === "close") {
      result = closeLedger(base);
    } else if (action === "abort") {
      result = abortLedger(base);
    } else if (action === "resume") {
      result = resumeLedger({ ...base, bugId: options.bug });
    } else if (action === "status") {
      result = statusLedger(base);
    } else {
      result = { ok: false, error: `unknown action: ${action ?? "(missing)"}. Use init|activate|claim|affect|add-bug|pause|close|abort|resume|status` };
    }
  } catch (error) {
    fail(error);
    return;
  }
  output(result);
  if (!result?.ok) process.exitCode = 1;
}
var isMain = process.argv[1] && resolve3(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
export {
  main
};
