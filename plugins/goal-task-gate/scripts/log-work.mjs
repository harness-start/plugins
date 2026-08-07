#!/usr/bin/env node
/**
 * Append a work.jsonl line for the active goal-task run.
 *
 * Usage:
 *   node log-work.mjs --workspace <root> --action edit --targets a,b --summary "..." [--decision-seq N] [--evidence e]
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { loadProjectConfig } from "./lib/config.mjs";
import { appendWorkLine, auditPaths, readCurrent, readMeta } from "./lib/trail.mjs";

function usage(code = 1) {
  process.stderr.write(`Usage:
  node log-work.mjs --workspace <root> --action <edit|write|shell|read|test|other> --targets a,b --summary <s> [--decision-seq N] [--evidence e] [--session-id id]
`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val != null && !val.startsWith("--")) {
        out[key] = val;
        i += 1;
      } else out[key] = true;
    }
  }
  return out;
}

function resolveRepoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return resolve(cwd);
  }
}

function fail(msg) {
  process.stderr.write(`[log-work] ${msg}\n`);
  process.exit(2);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) usage(0);

  const workspace = args.workspace || process.cwd();
  const repoRoot = resolveRepoRoot(workspace);
  const config = await loadProjectConfig(repoRoot, (m) =>
    process.stderr.write(`[log-work] ${m}\n`),
  );
  const runId = readCurrent(resolve(repoRoot, config.auditRoot, "CURRENT"));
  if (!runId) fail("no active run");

  const paths = auditPaths(repoRoot, config.auditRoot, runId);
  const meta = readMeta(paths.metaPath);
  if (!meta || meta.status !== "armed") fail(`run not armed: ${runId}`);

  if (!args.action || args.action === true) fail("missing --action");
  if (!args.summary || args.summary === true) fail("missing --summary");

  const sessionId = args["session-id"] ?? meta.sessionId ?? "";
  const result = appendWorkLine(
    paths.workPath,
    {
      action: args.action,
      targets: args.targets ?? "",
      summary: args.summary,
      evidence: args.evidence ?? "",
      decisionSeq: args["decision-seq"] != null ? Number(args["decision-seq"]) : null,
    },
    { runId, sessionId },
  );
  if (!result.ok) fail(result.error ?? "append failed");
  process.stdout.write(
    `${JSON.stringify({ ok: true, seq: result.line.seq, path: paths.relative.work })}\n`,
  );
}

main().catch((error) => fail(error?.stack ?? error));
