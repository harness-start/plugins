#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isRecord, type HookEvent } from "@harness/core/hook-event";
import { loadProjectConfig } from "../../lib/config.js";
import {
  extractSessionId,
  extractStructuredFileAccess,
  extractToolName,
  extractToolUseId,
  preToolDeny,
  readStdinJson,
  writeJson,
} from "../../lib/hook-io.js";
import {
  appendRecord,
  prepareTrail,
  sanitizeSessionKey,
} from "../../lib/jsonl-trail.js";
import { inferHost, resolveRepoRoot, toDisplayPath } from "../../lib/paths.js";
import { protectDecision } from "../../lib/protect.js";

function warn(message: string): void {
  process.stderr.write(`[file-access-audit] ${message}\n`);
}

function errorText(error: unknown): string {
  if (isRecord(error) && error.message != null) return String(error.message);
  return String(error);
}

function modeFromArgv(): "pre" | "post" {
  const mode = process.argv[2] ?? "post";
  if (mode === "pre" || mode === "post") return mode;
  return "post";
}

function extractCwd(event: HookEvent): string {
  const value = event.cwd ?? event.working_directory ?? event.workingDirectory;
  return typeof value === "string" ? value : process.cwd();
}

async function main(): Promise<void> {
  const mode = modeFromArgv();
  const event = await readStdinJson();
  if (event.__parseError) return;

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
  } catch (error: unknown) {
    warn(`failed to record file access: ${errorText(error)}`);
  }
}

const entryPath = process.argv[1];
const isMain = Boolean(entryPath) && fileURLToPath(import.meta.url) === resolve(entryPath ?? "");

if (isMain) {
  main().catch((error: unknown) => {
    warn(errorText(error));
    process.exitCode = 0;
  });
}
