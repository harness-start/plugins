#!/usr/bin/env node

import { resolve } from "node:path";

import {
  additionalContextOutput, extractCwd, extractWriteTargets, readStdinJson,
  writeJson,
} from "./lib/hook-io.mjs";
import {
  conflictFileFindings, formatConflictFindings, loadConflictConfig,
  resolveRepoRoot,
} from "./checks/file-checks.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const targets = extractWriteTargets(event);
  if (!targets.length) return;
  const cwd = resolve(extractCwd(event));
  const repoRoot = resolveRepoRoot(cwd);
  const config = await loadConflictConfig(repoRoot);
  const findings = conflictFileFindings(targets, repoRoot, cwd, config);
  if (!findings.length) return;
  const message = formatConflictFindings(findings);
  if (findings.some((finding) => finding.mode === "block")) {
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  } else {
    writeJson(additionalContextOutput("PostToolUse", message));
  }
}

main().catch((error) => {
  process.stderr.write(`[git-delivery-guards] post hook failed open: ${error?.message ?? error}\n`);
  process.exit(0);
});
