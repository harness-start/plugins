#!/usr/bin/env node
/**
 * Append or tip-rewrite a decision row under .goal-task/runs/<CURRENT>/decisions.tsv
 *
 * Usage:
 *   node log-decision.mjs --workspace <root> --phase p --kind k --decision d --why w --evidence e --result r [--scope s]
 *   node log-decision.mjs --workspace <root> --rewrite-tip <k> --rows-json '[{...}]'
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { loadProjectConfig } from "./lib/config.mjs";
import {
  appendDecision,
  auditPaths,
  readCurrent,
  readMeta,
  rewriteTip,
  writeMeta,
} from "./lib/trail.mjs";

function usage(code = 1) {
  process.stderr.write(`Usage:
  node log-decision.mjs --workspace <root> --phase <p> --kind <k> --decision <d> --why <w> --evidence <e> --result <r> [--scope <s>] [--session-id <id>]
  node log-decision.mjs --workspace <root> --rewrite-tip <k> --rows-json <json-array> [--session-id <id>]
`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val != null && !val.startsWith("--")) {
        out[key] = val;
        i += 1;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
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
  process.stderr.write(`[log-decision] ${msg}\n`);
  process.exit(2);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) usage(0);

  const workspace = args.workspace || args.cwd || process.cwd();
  const repoRoot = resolveRepoRoot(workspace);
  const config = await loadProjectConfig(repoRoot, (m) =>
    process.stderr.write(`[log-decision] ${m}\n`),
  );
  const auditRoot = config.auditRoot;

  const currentPath = resolve(repoRoot, auditRoot, "CURRENT");
  const runId = readCurrent(currentPath);
  if (!runId) fail("no active run (CURRENT empty); arm via /goal first");

  const paths = auditPaths(repoRoot, auditRoot, runId);
  const meta = readMeta(paths.metaPath);
  if (!meta || meta.status !== "armed") {
    fail(`run ${runId} is not armed (status=${meta?.status ?? "missing"})`);
  }

  // Prefer meta.tipWindow when present so rewrite bounds match the arm-time seal.
  const tipWindow =
    Number(meta.tipWindow) === 2 || Number(meta.tipWindow) === 3
      ? Number(meta.tipWindow)
      : config.tipWindow;

  const sessionId = args["session-id"] ?? args.session_id ?? meta.sessionId ?? "";

  if (args["rewrite-tip"] != null || args["rows-json"]) {
    const k = Number(args["rewrite-tip"]);
    if (!Number.isInteger(k)) fail("--rewrite-tip requires integer k");
    let rows;
    try {
      rows = JSON.parse(args["rows-json"] ?? "[]");
    } catch (error) {
      fail(`invalid --rows-json: ${error?.message ?? error}`);
    }
    const result = rewriteTip(paths.decisionsPath, k, rows, {
      runId,
      sessionId,
      tipWindow,
    });
    if (!result.ok) fail(result.error);
    meta.decisionCount = result.decisionCount;
    meta.tipHash = result.tipHash;
    meta.sealedThroughSeq = result.sealedThroughSeq;
    writeMeta(paths.metaPath, meta);
    process.stdout.write(
      `${JSON.stringify({ ok: true, action: "rewrite-tip", k, tipHash: result.tipHash, decisionCount: result.decisionCount })}\n`,
    );
    return;
  }

  for (const key of ["phase", "kind", "decision", "why", "evidence", "result"]) {
    if (args[key] == null || args[key] === true) fail(`missing --${key}`);
  }

  const result = appendDecision(
    paths.decisionsPath,
    {
      phase: args.phase,
      kind: args.kind,
      decision: args.decision,
      why: args.why,
      evidence: args.evidence,
      result: args.result,
      scope: args.scope ?? "",
    },
    { runId, sessionId, tipWindow },
  );
  if (!result.ok) fail(result.error);

  meta.decisionCount = result.decisionCount;
  meta.tipHash = result.tipHash;
  meta.sealedThroughSeq = result.sealedThroughSeq;
  writeMeta(paths.metaPath, meta);

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      action: "append",
      seq: Number(result.row.seq),
      tipHash: result.tipHash,
      kind: result.row.kind,
      path: paths.relative.decisions,
    })}\n`,
  );
}

main().catch((error) => {
  fail(error?.stack ?? error);
});
