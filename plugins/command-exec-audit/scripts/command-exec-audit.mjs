#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  durationMs,
  inferCommandStatus,
  redactCommand,
  sameToolUseId,
} from "./lib/command-policy.mjs";
import { loadProjectConfig } from "./lib/config.mjs";
import { ensureGitignore } from "./lib/gitignore.mjs";
import {
  extractCwd,
  extractSessionId,
  extractShellCommand,
  extractToolName,
  extractToolUseId,
  isShellTool,
  preToolDeny,
  readStdinJson,
  writeJson,
} from "./lib/hook-io.mjs";
import {
  appendRecord,
  findPendingByToolUseId,
  prepareTrail,
  readLastNonEmptyLine,
  rewriteTip,
  sanitizeSessionKey,
} from "./lib/jsonl-trail.mjs";
import { inferHost, resolveRepoRoot } from "./lib/paths.mjs";
import { protectDecision } from "./lib/protect.mjs";

function warn(message) {
  process.stderr.write(`[command-exec-audit] ${message}\n`);
}

function modeFromArgv() {
  const mode = process.argv[2] ?? "post";
  if (mode === "pre" || mode === "post" || mode === "failure") return mode;
  return "post";
}

function buildPendingRecord(event, command, config, now = new Date()) {
  const started = now.toISOString();
  return {
    schema: "command-exec/v1",
    ts: started,
    session_id: extractSessionId(event),
    cwd: resolve(extractCwd(event)),
    tool_name: extractToolName(event),
    tool_use_id: extractToolUseId(event),
    command: redactCommand(command, config),
    status: "pending",
    started_at: started,
    ended_at: null,
    duration_ms: null,
    exit_code: null,
    host: inferHost(),
  };
}

function finalizeRecord(base, event, forceFailure, config, now = new Date()) {
  const ended = now.toISOString();
  const { status, exit_code } = inferCommandStatus(event, forceFailure);
  const startedAt = base?.started_at ?? base?.ts ?? ended;
  const command = base?.command
    ?? redactCommand(extractShellCommand(event) ?? "", config);
  return {
    schema: "command-exec/v1",
    ts: ended,
    session_id: base?.session_id ?? extractSessionId(event),
    cwd: base?.cwd ?? resolve(extractCwd(event)),
    tool_name: base?.tool_name ?? extractToolName(event),
    tool_use_id: base?.tool_use_id ?? extractToolUseId(event),
    command,
    status,
    started_at: startedAt,
    ended_at: ended,
    duration_ms: durationMs(startedAt, ended),
    exit_code,
    host: base?.host ?? inferHost(),
  };
}

function matchingPendingTip(sessionPath, toolUseId) {
  const id = String(toolUseId ?? "").trim();
  if (!id) return null;
  const tip = readLastNonEmptyLine(sessionPath);
  if (!tip) return null;
  try {
    const parsed = JSON.parse(tip.line);
    if (
      parsed?.schema === "command-exec/v1"
      && parsed.status === "pending"
      && sameToolUseId(parsed.tool_use_id, id)
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
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
  const toolName = extractToolName(event);

  if (mode === "pre") {
    const decision = protectDecision(event, config.auditRoot, auditRootAbs);
    if (decision.deny) {
      writeJson(preToolDeny(decision.reason));
      return;
    }
    if (!isShellTool(toolName)) return;
    const command = extractShellCommand(event);
    if (!command) return;
    try {
      if (config.gitignoreEnsure) ensureGitignore(repoRoot, `${config.auditRoot}/`);
      const sessionKey = sanitizeSessionKey(extractSessionId(event), cwd);
      const paths = prepareTrail(repoRoot, config.auditRoot, sessionKey);
      appendRecord(paths.sessionPath, buildPendingRecord(event, command, config));
    } catch (error) {
      warn(`failed to record command start: ${error?.message ?? error}`);
    }
    return;
  }

  // post | failure — status + duration only
  if (!isShellTool(toolName)) return;
  const forceFailure = mode === "failure";
  try {
    if (config.gitignoreEnsure) ensureGitignore(repoRoot, `${config.auditRoot}/`);
    const sessionKey = sanitizeSessionKey(extractSessionId(event), cwd);
    const paths = prepareTrail(repoRoot, config.auditRoot, sessionKey);
    const toolUseId = extractToolUseId(event);

    // Prefer tip rewrite when last line is the matching pending with non-empty id.
    const tipBase = matchingPendingTip(paths.sessionPath, toolUseId);
    if (tipBase) {
      const finalRecord = finalizeRecord(tipBase, event, forceFailure, config);
      const result = rewriteTip(
        paths.sessionPath,
        (parsed) =>
          parsed?.schema === "command-exec/v1"
          && parsed.status === "pending"
          && sameToolUseId(parsed.tool_use_id, tipBase.tool_use_id),
        finalRecord,
      );
      if (result === "rewritten") return;
    }

    // Parallel tools or empty tool_use_id: append terminal; recover started_at by scan.
    const scanned = findPendingByToolUseId(paths.sessionPath, toolUseId);
    const finalRecord = finalizeRecord(scanned, event, forceFailure, config);
    appendRecord(paths.sessionPath, finalRecord);
  } catch (error) {
    warn(`failed to record command finish: ${error?.message ?? error}`);
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
