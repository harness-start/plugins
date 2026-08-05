#!/usr/bin/env node
/**
 * PreToolUse — protect machine-owned paths and other-session runs.
 * NEVER creates a run.
 *
 * Handles Claude Write/Edit and Codex apply_patch (path inside patch payload).
 */

import {
  readStdinJson,
  extractSessionId,
  extractCwd,
  extractToolName,
  extractToolInput,
  extractFilePath,
  preToolDeny,
  writeJson,
} from "./lib/hook-io.mjs";
import { resolveWorkspaceRoot } from "./lib/paths.mjs";
import { findRun } from "./lib/scan.mjs";
import {
  isProtectedMachinePath,
  isStagePath,
  isProcessConfidencePath,
  runIdFromPath,
  ownsRun,
} from "./lib/ownership.mjs";

const WRITE_TOOLS =
  /^(Edit|Write|MultiEdit|ApplyPatch|NotebookEdit|create_file|search_replace|apply_patch)$/i;

function pathsFromPatch(toolInput) {
  const blob = [toolInput?.patch, toolInput?.input, toolInput?.command]
    .filter((v) => typeof v === "string")
    .join("\n");
  if (!blob) return [];
  const paths = [];
  for (const line of blob.split("\n")) {
    const m = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/);
    if (m) paths.push(m[1].trim().replace(/\\n$/, ""));
  }
  return paths;
}

function collectTargets(toolName, toolInput) {
  const targets = [];
  const filePath = extractFilePath(toolInput);
  if (filePath) targets.push(filePath);
  if (typeof toolInput?.path === "string") targets.push(toolInput.path);
  if (WRITE_TOOLS.test(toolName) || /patch/i.test(toolName)) {
    targets.push(...pathsFromPatch(toolInput));
  }
  // Shell redirects (Codex sometimes writes via shell)
  const cmd = toolInput?.command ?? toolInput?.cmd;
  if (typeof cmd === "string") {
    for (const m of cmd.matchAll(/(?:>|>>)\s*([^\s;&|'"]+)/g)) {
      targets.push(m[1]);
    }
    if (cmd.includes("*** Begin Patch")) {
      targets.push(...pathsFromPatch({ patch: cmd }));
    }
  }
  return [...new Set(targets.filter(Boolean))];
}

function denyPath(filePath, sessionId, workspaceRoot) {
  if (!isProcessConfidencePath(filePath)) return null;

  if (isProtectedMachinePath(filePath)) {
    return [
      "[process-confidence] write denied — protected machine path",
      `path: ${filePath}`,
      "harm: receipts / run.json / ACTIVE.md / session-state 仅可由 hook 或已校验的 pcf 工具写入",
      "unblock: 编辑 stages/** 文档，或通过 pcf 工具操作流程状态",
    ].join("\n");
  }

  const runId = runIdFromPath(filePath);
  if (runId) {
    const run = findRun(workspaceRoot, runId);
    if (!run) {
      return `[process-confidence] write denied — unknown run ${runId}`;
    }
    if (sessionId && !ownsRun(run, sessionId)) {
      return [
        "[process-confidence] write denied — other session's run",
        `runId: ${runId}`,
        "harm: 禁止修改其他会话绑定的流程",
      ].join("\n");
    }
    if (isStagePath(filePath)) return null; // allow own stage path
  }

  if (isProcessConfidencePath(filePath) && !/config\.yaml$/.test(filePath)) {
    return `[process-confidence] write denied — path under .process-confidence not agent-writable: ${filePath}`;
  }

  return null;
}

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  const toolName = extractToolName(event);
  if (!WRITE_TOOLS.test(toolName) && !/write|edit|patch|shell|bash|exec/i.test(toolName)) {
    process.exit(0);
  }

  const toolInput = extractToolInput(event);
  const targets = collectTargets(toolName, toolInput);
  if (targets.length === 0) process.exit(0);

  const sessionId = extractSessionId(event);
  const workspaceRoot = resolveWorkspaceRoot(extractCwd(event));

  for (const filePath of targets) {
    const reason = denyPath(filePath, sessionId, workspaceRoot);
    if (reason) {
      writeJson(preToolDeny(reason));
      process.exit(0);
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
