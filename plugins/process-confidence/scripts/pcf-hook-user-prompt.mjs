#!/usr/bin/env node
/**
 * UserPromptSubmit — optional reminder only. NEVER creates a run.
 */

import {
  readStdinJson,
  extractSessionId,
  extractCwd,
  additionalContextOutput,
  writeJson,
  pcfCliHint,
} from "./lib/hook-io.mjs";
import { resolveWorkspaceRoot } from "./lib/paths.mjs";
import { listOpenRuns } from "./lib/scan.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  const sessionId = extractSessionId(event);
  const cwd = extractCwd(event);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const open = sessionId
    ? listOpenRuns(workspaceRoot, { sessionId })
    : [];
  const { beginExample } = pcfCliHint(sessionId);

  if (open.length > 0) {
    // Already has runs — light reminder only
    writeJson(
      additionalContextOutput(
        "UserPromptSubmit",
        `[process-confidence] 本会话有 ${open.length} 条 open 流程；完成阶段文档与验证后可自动收口。Stop 前请确保门禁通过。`,
      ),
    );
    process.exit(0);
  }

  writeJson(
    additionalContextOutput(
      "UserPromptSubmit",
      [
        "[process-confidence] 提醒：若本次是交付（改代码并需要可验证完成），请先：",
        beginExample,
        "纯问答/探索无需 begin。Hooks 不会自动创建流程。",
      ].join("\n"),
    ),
  );
  process.exit(0);
}

main().catch(() => process.exit(0));
