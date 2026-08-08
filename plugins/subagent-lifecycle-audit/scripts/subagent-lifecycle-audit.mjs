#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureGitignore } from "./lib/gitignore.mjs";
import {
  extractAgentId,
  extractAgentType,
  extractCwd,
  extractParentAgentId,
  extractSessionId,
  preToolDeny,
  readStdinJson,
  writeJson,
} from "./lib/hook-io.mjs";
import { appendLifecycleRecord, trailPaths } from "./lib/jsonl-trail.mjs";
import { buildLifecycleRecord } from "./lib/lifecycle.mjs";
import {
  inferHost,
  AUDIT_ROOT,
  resolveRepoRoot,
  sanitizeSessionKey,
} from "./lib/paths.mjs";
import { protectDecision } from "./lib/protect.mjs";

function warn(message) {
  process.stderr.write(`[subagent-lifecycle-audit] ${message}\n`);
}

function modeFromArgv() {
  const mode = process.argv[2];
  return mode === "start" || mode === "stop" || mode === "protect"
    ? mode
    : null;
}

async function main() {
  const mode = modeFromArgv();
  if (!mode) return;
  const event = await readStdinJson();
  if (event?.__parseError) return;

  const cwd = resolve(extractCwd(event));
  const repoRoot = resolveRepoRoot(cwd);
  if (mode === "protect") {
    const decision = protectDecision(
      event,
      AUDIT_ROOT,
      resolve(repoRoot, AUDIT_ROOT),
    );
    if (decision.deny) writeJson(preToolDeny(decision.reason));
    return;
  }
  const sessionId = extractSessionId(event);
  const paths = trailPaths(
    repoRoot,
    sanitizeSessionKey(sessionId, cwd),
  );
  await ensureGitignore(repoRoot);
  await appendLifecycleRecord(paths, (rows) => buildLifecycleRecord({
    mode,
    host: inferHost(),
    sessionId,
    agentId: extractAgentId(event),
    agentType: extractAgentType(event),
    parentAgentId: extractParentAgentId(event),
    provenanceSessionId: process.env.AI_EXPERTS_SESSION_ID?.trim() || null,
    triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM?.trim() || null,
  }, rows));
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  main().catch((error) => {
    warn(error?.message ?? String(error));
    process.exitCode = 0;
  });
}
