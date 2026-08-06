#!/usr/bin/env node
import {
  extractAssistantMessage,
  isStopHookActive,
  readStdinJson,
  stopBlock,
  writeJson,
} from "./lib/hook-io.mjs";
import { loadConfig } from "./lib/config.mjs";
import { resolveGitRoot, readCwd } from "./lib/workspace.mjs";
import { tryEnterHygieneFlow } from "./lib/enter-flow.mjs";
import {
  analyzeReturn,
  DEFAULT_HYGIENE,
  formatBlockReason,
  shouldBlock,
} from "./lib/hygiene.mjs";
import {
  countReturnAttempts,
  readSpawnRecord,
  writeReturnRecord,
} from "./lib/ledger.mjs";
import { detectWorkspaceDiff } from "./lib/diff.mjs";
import { resolveTaskClass } from "./lib/task-class.mjs";

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;

  const cwd = readCwd(event);
  const gitRoot = cwd ? resolveGitRoot(cwd) : null;
  const { evidence } = await loadConfig(gitRoot);
  const conf = { ...DEFAULT_HYGIENE, ...evidence };

  if (conf.mode === "off") return;

  const ctx = tryEnterHygieneFlow(event, conf);
  if (!ctx.entered) return;

  const message = extractAssistantMessage(event);
  if (!message) return;

  const spawn = ctx.workspaceRoot
    ? readSpawnRecord(ctx.workspaceRoot, ctx.agentId)
    : null;
  const parentBrief =
    spawn?.parentBriefExcerpt ||
    (conf.storeBriefExcerpt ? ctx.brief : "") ||
    "";
  const taskClass =
    spawn?.taskClass ||
    resolveTaskClass(ctx.agentType, ctx.brief, conf.agentTypeMap || {});
  const diffStatus = detectWorkspaceDiff(ctx.workspaceRoot);

  const analysis = analyzeReturn({
    message,
    parentBrief,
    taskClass,
    diffStatus,
    cfg: conf,
  });

  const priorAttempts = ctx.workspaceRoot
    ? countReturnAttempts(ctx.workspaceRoot, ctx.agentId)
    : 0;
  // attempt is 1-based for this stop evaluation after counting prior returns
  const attempt = priorAttempts + 1;
  const stopHookActive = isStopHookActive(event);
  const block = shouldBlock(conf.mode, analysis, {
    stopHookActive,
    attempt,
    maxAttempts: conf.maxAttempts,
  });
  const forcedPass =
    conf.mode === "block" &&
    analysis.hardFail &&
    !stopHookActive &&
    attempt >= conf.maxAttempts;

  if (ctx.workspaceRoot) {
    try {
      writeReturnRecord(ctx.workspaceRoot, ctx.agentId, {
        v: 1,
        agentId: ctx.agentId,
        sessionId: ctx.sessionId,
        taskClass,
        mode: conf.mode,
        hardFail: analysis.hardFail,
        qualityPass: analysis.qualityPass,
        features: analysis.features,
        diagnostics: {
          ...analysis.diagnostics,
          diffScope: "workspace",
        },
        attempt,
        forcedPass,
        blocked: block,
        reasons: analysis.reasons,
        at: new Date().toISOString(),
      });
    } catch {
      // best-effort
    }
  }

  if (block) {
    writeJson(stopBlock(formatBlockReason(analysis)));
  }
}

main().catch(() => {});
