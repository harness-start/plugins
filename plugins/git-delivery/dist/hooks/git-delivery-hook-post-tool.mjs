#!/usr/bin/env node
// harness-source-hash: sha256:33cc52d23aae608a5d6c8a2efea2ebe78fc416df4d175db64653a38e8950e523
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
} from "../chunks/chunk-OLUWPGKU.mjs";

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
