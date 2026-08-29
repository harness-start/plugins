#!/usr/bin/env node
// harness-source-hash: sha256:682871b423f457dc4a239bf59b0d4a2e710c429fd69b163bc4a82a111176fea0
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
} from "../chunks/chunk-NTQ7RHD4.mjs";

// plugins/delivery-governance/modules/git/src/entries/hooks/git-delivery-hook-post-tool.ts
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
