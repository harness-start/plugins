#!/usr/bin/env node

import { resolve } from "node:path";

import { isRecord, type HookEvent } from "@harness/core/hook-event";
import {
  durationMs,
  inferCommandStatus,
  redactCommand,
  sameToolUseId,
} from "../../lib/command-policy.js";
import { loadProjectConfig, type AgentActivityConfig } from "../../lib/config.js";
import {
  extractCwd,
  extractSessionId,
  extractShellCommand,
  extractStructuredFileAccess,
  extractToolName,
  extractToolUseId,
  isShellTool,
  preToolDeny,
  readStdinJson,
  writeJson,
} from "../../lib/hook-io.js";
import {
  appendRecord,
  findPendingByToolUseId,
  prepareTrail,
  readLastNonEmptyLine,
  rewriteTip,
  sanitizeSessionKey,
} from "../../lib/jsonl-trail.js";
import { inferHost, resolveRepoRoot, toDisplayPath } from "../../lib/paths.js";
import { protectDecision } from "../../lib/protect.js";

type HookMode = "pre" | "post" | "failure";

function warn(message: string): void {
  process.stderr.write(`[agent-activity-audit] ${message}\n`);
}

function errorText(error: unknown): string {
  if (isRecord(error) && error.message != null) return String(error.message);
  return String(error);
}

function stringField(record: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function modeFromArgv(): HookMode {
  const mode = process.argv[2] ?? "post";
  if (mode === "pre" || mode === "post" || mode === "failure") return mode;
  return "post";
}

function buildPendingRecord(event: HookEvent, command: string, config: AgentActivityConfig, now = new Date()) {
  const started = now.toISOString();
  return {
    schema: "agent-activity/v1",
    kind: "command",
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

function finalizeRecord(
  base: Record<string, unknown> | null | undefined,
  event: HookEvent,
  forceFailure: boolean,
  config: AgentActivityConfig,
  now = new Date(),
) {
  const ended = now.toISOString();
  const { status, exit_code } = inferCommandStatus(event, forceFailure);
  const startedAt = stringField(base, "started_at") ?? stringField(base, "ts") ?? ended;
  const command = stringField(base, "command")
    ?? redactCommand(extractShellCommand(event) ?? "", config);
  return {
    schema: "agent-activity/v1",
    kind: "command",
    ts: ended,
    session_id: stringField(base, "session_id") ?? extractSessionId(event),
    cwd: stringField(base, "cwd") ?? resolve(extractCwd(event)),
    tool_name: stringField(base, "tool_name") ?? extractToolName(event),
    tool_use_id: stringField(base, "tool_use_id") ?? extractToolUseId(event),
    command,
    status,
    started_at: startedAt,
    ended_at: ended,
    duration_ms: durationMs(startedAt, ended),
    exit_code,
    host: stringField(base, "host") ?? inferHost(),
  };
}

function matchingPendingTip(sessionPath: string, toolUseId: unknown): Record<string, unknown> | null {
  const id = String(toolUseId ?? "").trim();
  if (!id) return null;
  const tip = readLastNonEmptyLine(sessionPath);
  if (!tip) return null;
  try {
    const parsed: unknown = JSON.parse(tip.line);
    if (
      isRecord(parsed)
      && parsed.schema === "agent-activity/v1"
      && parsed.kind === "command"
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

export async function main(): Promise<void> {
  const mode = modeFromArgv();
  const event = await readStdinJson();
  if (event.__parseError) return;

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
      const sessionKey = sanitizeSessionKey(extractSessionId(event), cwd);
      const paths = prepareTrail(repoRoot, config.auditRoot, sessionKey);
      appendRecord(paths.sessionPath, buildPendingRecord(event, command, config));
    } catch (error: unknown) {
      warn(`failed to record command start: ${errorText(error)}`);
    }
    return;
  }

  if (mode === "post") {
    const access = extractStructuredFileAccess(event);
    if (access && access.paths.length > 0) {
      try {
        const sessionKey = sanitizeSessionKey(extractSessionId(event), cwd);
        const paths = prepareTrail(repoRoot, config.auditRoot, sessionKey);
        appendRecord(paths.sessionPath, {
          schema: "agent-activity/v1",
          kind: "file",
          ts: new Date().toISOString(),
          session_id: extractSessionId(event),
          cwd,
          tool_name: access.toolName || toolName,
          tool_use_id: extractToolUseId(event),
          op: access.op,
          paths: access.paths.map((path) => toDisplayPath(path, repoRoot)),
          host: inferHost(),
        });
      } catch (error: unknown) {
        warn(`failed to record file access: ${errorText(error)}`);
      }
    }
  }

  // post | failure — command status + duration only
  if (!isShellTool(toolName)) return;
  const forceFailure = mode === "failure";
  try {
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
          isRecord(parsed)
          && parsed.schema === "agent-activity/v1"
          && parsed.kind === "command"
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
  } catch (error: unknown) {
    warn(`failed to record command finish: ${errorText(error)}`);
  }
}
