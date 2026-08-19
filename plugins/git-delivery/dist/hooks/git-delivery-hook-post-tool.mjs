#!/usr/bin/env node
// harness-source-hash: sha256:1d952498890ad388eddbbc17d0f899c24e442a2725c5cd1cba0652ccc1fca3a6
import {
  conflictFileFindings,
  formatConflictFindings,
  loadConflictConfig,
  resolveRepoRoot
} from "../chunks/chunk-YX7VOU6D.mjs";
import {
  additionalContextOutput,
  eventCwd,
  extractWriteTargets,
  readStdinJson,
  writeJson
} from "../chunks/chunk-I2VJ6UPN.mjs";

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
