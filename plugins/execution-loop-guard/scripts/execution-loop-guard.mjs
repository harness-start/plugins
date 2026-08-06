#!/usr/bin/env node

import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProjectConfig } from "./lib/config.mjs";
import {
  contextOutput,
  extractCwd,
  extractFileTargets,
  extractShellCommand,
  extractToolResponse,
  preToolDeny,
  readStdinJson,
  writeJson,
} from "./lib/hook-io.mjs";
import {
  commandHash,
  countRemotePolls,
  estimateSleepSeconds,
  failureSignature,
  inferCommandOutcome,
  isReadOnlyCommand,
  isVerificationCommand,
  normalizeCommand,
  regexMatches,
} from "./lib/execution-loop-policy.mjs";
import { digest, updateState } from "./lib/state-store.mjs";

function warn(message) {
  process.stderr.write(`[execution-loop-guard] ${message}\n`);
}

function relativePath(path, repoRoot, cwd) {
  const base = repoRoot ?? cwd;
  const candidate = relative(base, path).replaceAll("\\", "/");
  return candidate.startsWith("../") ? path.replaceAll("\\", "/") : candidate;
}

function actionFor(mode, streak, reportAt, blockAt) {
  if (mode === "off" || streak < reportAt) return "allow";
  if (mode === "block" && streak >= blockAt) return "block";
  return "report";
}

function retryMessage({ action, command, outcome, streak, blockAt, windowMinutes }) {
  const kind = outcome === "failure" ? "失败命令" : "成功命令";
  const lines = [
    `[Execution Loop Guard] ${kind}重复执行 ${streak} 次`,
    `命令：${normalizeCommand(command).slice(0, 160)}`,
    "",
  ];
  if (action === "block") {
    lines.push(
      "blockingContract:",
      `  observedFacts: 同一${kind}在 ${windowMinutes} 分钟窗口内达到阻断阈值。`,
      "  harm: 不分析结果地重复执行不会产生进展，并会消耗会话与外部资源。",
      "  unblockWhen: 阅读最新输出，形成新的根因假设或改变实现、参数、环境后再验证。",
      "  recovery: 修复根因后重新执行；确属有意重复时在命令末尾添加 `# retry-ok`。",
      "",
      "本次阻断已清空该命令的重复周期，修复后可以重新开始。",
    );
  } else {
    lines.push(
      `再重复 ${Math.max(0, blockAt - streak)} 次将被阻断。`,
      "请先检查上一次输出并确认重复执行是否能产生新证据。",
    );
  }
  return lines.join("\n");
}

function pollingMessage(action, command, sleepSum, querySum, settings) {
  const lines = [
    `[Execution Loop Guard] 远端轮询超预算：近 ${settings.windowMinutes} 分钟累计 sleep 约 ${Math.round(sleepSum)}s、状态查询 ${querySum} 次`,
    `当前命令：${String(command).trim().slice(0, 160)}`,
    "",
  ];
  if (action === "block") {
    lines.push(
      "blockingContract:",
      "  observedFacts: 远端状态查询或显式 sleep 已达到当前窗口预算。",
      "  harm: 无终止条件的轮询会持续占用会话、Runner 与远端 API 配额。",
      "  unblockWhen: 改用有总预算、退避和终止条件的监督流程，或只执行一次状态快照。",
      "  recovery: 确属预期等待时在命令末尾添加 `# poll-ok`，该命令将不计入预算。",
    );
  } else {
    lines.push(
      "请改用有总预算、退避和终止条件的监督流程；只需快照时执行一次状态查询。",
      "确属预期等待可在命令末尾添加 `# poll-ok`，该命令将不计入预算。",
    );
  }
  return lines.join("\n");
}

function runPre(event, config) {
  const command = extractShellCommand(event);
  if (!command?.trim()) return;
  const now = Date.now();
  const decision = updateState(event, (state) => {
    const reports = [];
    let block = null;
    const repeat = config.commandRepeat;
    const retryBypass = regexMatches(repeat.retryBypass, command);

    if (retryBypass) {
      state.command = null;
    } else if (!isReadOnlyCommand(command)) {
      const normalizedHash = commandHash(command);
      const previous = state.command && now - Number(state.command.lastSeen) <= repeat.windowMinutes * 60_000
        ? state.command
        : null;
      if (previous?.commandHash === normalizedHash) {
        const failed = previous.lastOutcome === "failure";
        const streak = (failed ? Number(previous.failStreak) : Number(previous.successStreak)) + 1;
        const mode = failed ? config.checks.failedCommandRetry : config.checks.successfulCommandRepeat;
        const reportAt = failed ? repeat.failureReportAt : repeat.successReportAt;
        const blockAt = failed ? repeat.failureBlockAt : repeat.successBlockAt;
        const action = actionFor(mode, streak, reportAt, blockAt);
        if (action !== "allow") {
          const message = retryMessage({
            action,
            command,
            outcome: failed ? "failure" : "success",
            streak,
            blockAt,
            windowMinutes: repeat.windowMinutes,
          });
          if (action === "block") {
            state.command = null;
            block = message;
          } else reports.push(message);
        }
      }
    }

    if (!block && config.checks.remotePolling !== "off" && !regexMatches(config.polling.pollBypass, command)) {
      const sleepSeconds = estimateSleepSeconds(command, config.polling);
      const queryCount = countRemotePolls(command);
      if (sleepSeconds > 0 || queryCount > 0) {
        const windowMs = config.polling.windowMinutes * 60_000;
        const previous = state.polling && now - Number(state.polling.lastSeen) <= windowMs
          ? state.polling
          : null;
        const entries = Array.isArray(previous?.entries)
          ? previous.entries.filter((entry) => now - Number(entry.at) <= windowMs)
          : [];
        entries.push({ at: now, sleepSeconds, queryCount });
        const sleepSum = entries.reduce((sum, entry) => sum + Number(entry.sleepSeconds || 0), 0);
        const querySum = entries.reduce((sum, entry) => sum + Number(entry.queryCount || 0), 0);
        const overBudget = sleepSum >= config.polling.sleepBudgetSeconds || querySum >= config.polling.queryBudgetCount;
        const lastReportAt = Number(previous?.lastReportAt) || 0;
        const cooledDown = now - lastReportAt >= config.polling.cooldownMinutes * 60_000;
        if (overBudget && cooledDown) {
          const action = config.checks.remotePolling === "block" ? "block" : "report";
          const message = pollingMessage(action, command, sleepSum, querySum, config.polling);
          if (config.checks.remotePolling === "block") block = message;
          else reports.push(message);
        }
        state.polling = {
          entries,
          lastReportAt: overBudget && cooledDown ? now : lastReportAt,
          lastSeen: now,
        };
      }
    }
    return { block, reports };
  });
  if (!decision) return;
  if (decision.block) writeJson(preToolDeny(decision.block));
  else if (decision.reports.length > 0) writeJson(contextOutput("PreToolUse", decision.reports.join("\n\n")));
}

function recordCommandOutcome(event, config, forceFailure) {
  const command = extractShellCommand(event);
  if (!command?.trim()) return;
  const now = Date.now();
  updateState(event, (state) => {
    if (regexMatches(config.commandRepeat.retryBypass, command)) {
      state.command = null;
      return;
    }
    if (isReadOnlyCommand(command)) return;
    const outcome = inferCommandOutcome(event, forceFailure);
    const normalizedHash = commandHash(command);
    const previous = state.command &&
      now - Number(state.command.lastSeen) <= config.commandRepeat.windowMinutes * 60_000 &&
      state.command.commandHash === normalizedHash
      ? state.command
      : null;
    const signature = outcome === "failure"
      ? failureSignature(command, extractToolResponse(event))
      : null;
    const sameFailure = outcome === "failure" &&
      previous?.lastOutcome === "failure" &&
      previous.failureSignature === signature;
    state.command = {
      commandHash: normalizedHash,
      failStreak: outcome === "failure" ? (sameFailure ? Number(previous.failStreak) + 1 : 1) : 0,
      successStreak: outcome === "success" && previous?.lastOutcome === "success"
        ? Number(previous.successStreak) + 1
        : outcome === "success" ? 1 : 0,
      lastOutcome: outcome,
      failureSignature: signature,
      lastSeen: now,
    };
    if (outcome === "success" && isVerificationCommand(command)) state.edits = {};
  });
}

function editMessage(action, findings, settings) {
  const lines = [
    `[Execution Loop Guard] ${action === "block" ? "编辑循环已阻断" : "检测到高频编辑"}`,
    "",
    ...findings.map((finding) => `- ${finding.path}: ${finding.count} 次（近 ${settings.windowMinutes} 分钟）`),
    "",
  ];
  if (action === "block") {
    lines.push(
      "blockingContract:",
      "  observedFacts: 同一文件在滚动窗口内达到编辑阻断阈值。",
      "  harm: 持续小改通常意味着缺少稳定根因、完整文件理解或有效验证反馈。",
      "  unblockWhen: 重读完整文件、diff 和验证输出，形成一个可证伪假设与最小修改方案。",
      "  recovery: 先运行相关验证或重新制定方案；成功验证会清空本会话编辑计数。",
      "",
      "被阻断文件的计数周期已清空，下一次修改会从新周期开始。",
    );
  } else {
    lines.push(`达到 ${settings.blockAt} 次时将阻断；成功运行测试、lint、typecheck 或其他验证命令会清空本会话编辑计数。`);
  }
  return lines.join("\n");
}

function recordEdits(event, config, repoRoot, cwd) {
  const targets = extractFileTargets(event);
  if (targets.length === 0 || config.checks.editLoop === "off") return;
  const now = Date.now();
  const result = updateState(event, (state) => {
    const findings = [];
    const windowMs = config.editLoop.windowMinutes * 60_000;
    for (const target of targets) {
      const path = relativePath(target, repoRoot, cwd);
      if (config.editLoop.exemptPaths.some((pattern) => regexMatches(pattern, path))) continue;
      const key = digest(resolve(target));
      const previous = state.edits[key];
      const timestamps = Array.isArray(previous?.timestamps)
        ? previous.timestamps.filter((timestamp) => now - Number(timestamp) <= windowMs)
        : [];
      timestamps.push(now);
      const count = timestamps.length;
      const action = actionFor(
        config.checks.editLoop,
        count,
        config.editLoop.reportAt,
        config.editLoop.blockAt,
      );
      if (action === "block") delete state.edits[key];
      else state.edits[key] = { timestamps };
      if (action !== "allow") findings.push({ path, count, action });
    }
    return findings;
  });
  if (!result?.length) return;
  const action = result.some((finding) => finding.action === "block") ? "block" : "report";
  const message = editMessage(action, result, config.editLoop);
  if (action === "block") {
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  } else {
    writeJson(contextOutput("PostToolUse", message));
  }
}

export async function main(mode = process.argv[2]) {
  const event = await readStdinJson();
  if (event.__parseError || !["pre", "post", "failure"].includes(mode)) return;
  const cwd = resolve(extractCwd(event));
  const { config, repoRoot } = await loadProjectConfig(cwd, warn);
  if (mode === "pre") {
    runPre(event, config);
    return;
  }
  recordCommandOutcome(event, config, mode === "failure");
  if (mode === "post") recordEdits(event, config, repoRoot, cwd);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    warn(`hook failed open: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(0);
  });
}
