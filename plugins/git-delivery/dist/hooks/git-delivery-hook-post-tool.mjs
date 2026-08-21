#!/usr/bin/env node
// harness-source-hash: sha256:7aa3eb7d3aa82beb1eeccf55ee92f5fa0596a7425e7ffeb909dbe68047510f02
import {
  additionalContextOutput,
  conflictFileFindings,
  eventCwd,
  extractWriteTargets,
  formatConflictFindings,
  loadConflictConfig,
  readStdinJson,
  resolveRepoRoot,
  writeJson
} from "../chunks/chunk-NDWCKHHF.mjs";

// plugins/git-delivery/src/entries/hooks/git-delivery-hook-post-tool.ts
import { resolve } from "node:path";
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const targets = extractWriteTargets(event);
  if (!targets.length) return;
  const cwd = resolve(eventCwd(event));
  const repoRoot = resolveRepoRoot(cwd);
  const config = await loadConflictConfig(repoRoot);
  const findings = conflictFileFindings(targets, repoRoot, cwd, config);
  if (!findings.length) return;
  const message = formatConflictFindings(findings);
  if (findings.some((finding) => finding.mode === "block")) {
    process.stderr.write(`${message}
`);
    process.exitCode = 2;
  } else {
    writeJson(additionalContextOutput("PostToolUse", message));
  }
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[git-delivery] post hook failed open: ${message}
`);
  process.exit(0);
});
