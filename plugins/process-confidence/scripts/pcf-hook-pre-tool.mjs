#!/usr/bin/env node
/**
 * PreToolUse — protect machine-owned paths and other-session runs.
 * NEVER creates a run.
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
  /^(Edit|Write|MultiEdit|ApplyPatch|NotebookEdit|create_file|search_replace)$/i;

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  const toolName = extractToolName(event);
  if (!WRITE_TOOLS.test(toolName) && !/write|edit|patch/i.test(toolName)) {
    process.exit(0);
  }

  const toolInput = extractToolInput(event);
  const filePath = extractFilePath(toolInput);
  if (!filePath) process.exit(0);

  if (!isProcessConfidencePath(filePath)) {
    process.exit(0);
  }

  const sessionId = extractSessionId(event);
  const workspaceRoot = resolveWorkspaceRoot(extractCwd(event));

  // Protect machine-owned paths
  if (isProtectedMachinePath(filePath)) {
    writeJson(
      preToolDeny(
        [
          "[process-confidence] write denied — protected machine path",
          `path: ${filePath}`,
          "harm: receipts / run.json / ACTIVE.md / session-state 仅可由 hook 或已校验的 pcf 工具写入",
          "unblock: 编辑 stages/** 文档，或通过 pcf 工具操作流程状态",
        ].join("\n"),
      ),
    );
    process.exit(0);
  }

  // Stage writes: only own session's run
  const runId = runIdFromPath(filePath);
  if (runId) {
    const run = findRun(workspaceRoot, runId);
    if (!run) {
      writeJson(
        preToolDeny(
          `[process-confidence] write denied — unknown run ${runId}`,
        ),
      );
      process.exit(0);
    }
    if (sessionId && !ownsRun(run, sessionId)) {
      writeJson(
        preToolDeny(
          [
            "[process-confidence] write denied — other session's run",
            `runId: ${runId}`,
            "harm: 禁止修改其他会话绑定的流程",
          ].join("\n"),
        ),
      );
      process.exit(0);
    }
    // own stage path — allow
    if (isStagePath(filePath)) process.exit(0);
  }

  // Other .process-confidence paths default deny (except config.yaml already allowed by isProtected)
  if (isProcessConfidencePath(filePath) && !/config\.yaml$/.test(filePath)) {
    writeJson(
      preToolDeny(
        `[process-confidence] write denied — path under .process-confidence not agent-writable: ${filePath}`,
      ),
    );
    process.exit(0);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
