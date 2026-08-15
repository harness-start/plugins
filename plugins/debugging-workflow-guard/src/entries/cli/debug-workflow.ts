#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
} from "../../lib/writer.js";

function parseArgs(argv) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
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
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(error) {
  output({ ok: false, error: String(error?.message ?? error) });
  process.exitCode = 1;
}

function list(value) {
  if (Array.isArray(value)) return value;
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

export async function main(argv = process.argv.slice(2)) {
  const { options, positionals } = parseArgs(argv);
  const action = positionals[0];
  const cwd = options.cwd ? resolve(String(options.cwd)) : process.cwd();
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
  } catch (error) {
    fail(error);
    return;
  }
  output(result);
  if (!result?.ok) process.exitCode = 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
