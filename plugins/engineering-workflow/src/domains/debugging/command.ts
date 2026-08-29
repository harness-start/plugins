#!/usr/bin/env node

import { resolve } from "node:path";

import {
  abortLedger,
  activateBug,
  addBug,
  affectBugs,
  claimHypothesis,
  claimRootCause,
  closeLedger,
  initLedger,
  pauseLedger,
  resumeLedger,
  statusLedger,
  type WriterResult,
} from "./lib/writer.js";

function parseArgs(argv: string[]): { options: Record<string, string | boolean>; positionals: string[] } {
  const options: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === undefined) continue;
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

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function printHelp(action?: string): void {
  const usage = action === "claim"
    ? "Usage: harness debug claim --bug BUG-NNN (--hypothesis HN --status supported|falsified|open | --root-cause TEXT --chain STEP|STEP) --receipt R-N"
    : "Usage: harness debug <init|activate|claim|affect|add-bug|pause|close|abort|resume|status> [options]";
  process.stdout.write(`${usage}\n`);
}

function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : error;
  output({ ok: false, error: String(message ?? error) });
  process.exitCode = 1;
}

function list(value: unknown): unknown[] | string[] {
  if (Array.isArray(value)) return value;
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { options, positionals } = parseArgs(argv);
  const action = positionals[0];
  if (options.help === true || positionals.includes("-h")) {
    printHelp(action);
    return;
  }
  const cwd = options.cwd ? resolve(String(options.cwd)) : process.cwd();
  const base = { cwd, id: options.id, slug: options.slug };
  let result: WriterResult;
  try {
    if (action === "init" || action === "open") {
      if (options.goal !== "diagnose" && (!options["user-outcome"] || !options.acceptance)) {
        result = { ok: false, error: "userOutcome and acceptance are required for fix work orders" };
      } else result = initLedger({
        ...base,
        summary: options.summary,
        userOutcome: options["user-outcome"],
        expected: options.expected,
        actual: options.actual,
        reproduction: options.repro || options.reproduction,
        acceptance: options.acceptance,
        environment: options.environment,
        h1: options.h1,
        h1Falsifier: options["h1-falsifier"],
        h2: options.h2,
        h2Falsifier: options["h2-falsifier"],
        goal: options.goal,
        mode: options.mode,
        bugId: options.bug,
        priority: options.priority,
      });
    } else if (action === "activate") {
      result = activateBug({ ...base, bugId: options.bug || options["bug-id"] });
    } else if (action === "claim" && (options["root-cause"] || options.statement)) {
      result = claimRootCause({
        ...base,
        bugId: options.bug,
        statement: options["root-cause"] || options.statement,
        chain: options.chain,
        receiptId: options.receipt,
      });
    } else if (action === "claim") {
      result = claimHypothesis({
        ...base,
        bugId: options.bug,
        hypothesisId: options.hypothesis || options.h,
        status: options.status || "supported",
        receiptId: options.receipt,
      });
    } else if (action === "affect") {
      result = affectBugs({ ...base, bugId: options.bug, affectedBugIds: list(options.bugs) });
    } else if (action === "add-bug") {
      if (options.goal !== "diagnose" && (!options["user-outcome"] || !options.acceptance)) {
        result = { ok: false, error: "userOutcome and acceptance are required for fix work orders" };
      } else result = addBug({
        ...base,
        bugId: options.bug || options["bug-id"],
        summary: options.summary,
        userOutcome: options["user-outcome"],
        expected: options.expected,
        actual: options.actual,
        reproduction: options.repro || options.reproduction,
        acceptance: options.acceptance,
        environment: options.environment,
        h1: options.h1,
        h1Falsifier: options["h1-falsifier"],
        h2: options.h2,
        h2Falsifier: options["h2-falsifier"],
        goal: options.goal,
      });
    } else if (action === "pause") {
      result = pauseLedger({
        ...base,
        nextAction: options.next || options["next-action"],
        nextBugId: options["next-bug"] || options.bug,
        recovery: options.recovery,
        architectureReview: Boolean(options["architecture-review"]),
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
  } catch (error: unknown) {
    fail(error);
    return;
  }
  output(result);
  if (!result?.ok) process.exitCode = 1;
}
