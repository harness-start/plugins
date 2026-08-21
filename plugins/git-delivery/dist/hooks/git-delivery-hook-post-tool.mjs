#!/usr/bin/env node
// harness-source-hash: sha256:b5503af635117964ca63ec9658d0cf107d5dd4109556add2d6b1ba2c4342bf14
import {
  conflictFileFindings,
  formatConflictFindings,
  loadConflictConfig,
  resolveRepoRoot
} from "../chunks/chunk-3TLJR5NK.mjs";
import {
  additionalContextOutput,
  eventCwd,
  extractWriteTargets,
  readStdinJson,
  writeJson
} from "../chunks/chunk-G6TGSGCB.mjs";

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
