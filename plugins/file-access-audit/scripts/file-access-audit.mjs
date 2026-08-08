#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProjectConfig } from "./lib/config.mjs";
import { ensureGitignore } from "./lib/gitignore.mjs";
import {
  extractSessionId,
  extractStructuredFileAccess,
  extractToolName,
  extractToolUseId,
  preToolDeny,
  readStdinJson,
  writeJson,
} from "./lib/hook-io.mjs";
import {
  appendRecord,
  prepareTrail,
  sanitizeSessionKey,
} from "./lib/jsonl-trail.mjs";
import { inferHost, resolveRepoRoot, toDisplayPath } from "./lib/paths.mjs";
import { protectDecision } from "./lib/protect.mjs";

function warn(message) {
  process.stderr.write(`[file-access-audit] ${message}\n`);
}

function modeFromArgv() {
  const mode = process.argv[2] ?? "post";
  if (mode === "pre" || mode === "post") return mode;
  return "post";
}

function extractCwd(event) {
  return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd();
}

async function main() {
  const mode = modeFromArgv();
  const event = await readStdinJson();
  if (event?.__parseError) return;

  const cwd = resolve(extractCwd(event));
  const repoRoot = resolveRepoRoot(cwd) ?? cwd;
  const config = await loadProjectConfig(repoRoot, warn);
  if (!config.enabled) return;

  const auditRootAbs = resolve(repoRoot, config.auditRoot);

  if (mode === "pre") {
    const decision = protectDecision(event, config.auditRoot, auditRootAbs);
    if (decision.deny) {
      writeJson(preToolDeny(decision.reason));
    }
    return;
  }

  // post: record structured file access
  const access = extractStructuredFileAccess(event);
  if (!access || access.paths.length === 0) return;

  try {
    if (config.gitignoreEnsure) {
      ensureGitignore(repoRoot, `${config.auditRoot}/`);
    }
    const sessionKey = sanitizeSessionKey(extractSessionId(event), cwd);
    const paths = prepareTrail(repoRoot, config.auditRoot, sessionKey);
    const record = {
      schema: "file-access/v1",
      ts: new Date().toISOString(),
      session_id: extractSessionId(event),
      cwd,
      tool_name: access.toolName || extractToolName(event),
      tool_use_id: extractToolUseId(event),
      op: access.op,
      paths: access.paths.map((path) => toDisplayPath(path, repoRoot)),
      host: inferHost(event),
    };
    appendRecord(paths.sessionPath, record);
  } catch (error) {
    warn(`failed to record file access: ${error?.message ?? error}`);
  }
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  main().catch((error) => {
    warn(error?.message ?? String(error));
    process.exitCode = 0;
  });
}
