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
  commandInputFingerprint,
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
  const kind = outcome === "failure" ? "failed command" : "successful command";
  const lines = [
    `[Execution Loop Guard] ${kind} repeated ${streak} times`,
    `Command: ${normalizeCommand(command).slice(0, 160)}`,
    "",
  ];
  if (action === "block") {
    lines.push(
      "blockingContract:",
      `  observedFacts: The same ${kind} reached the blocking threshold within a ${windowMinutes}-minute window.`,
      "  harm: Repeating a command without analyzing its result cannot make progress and consumes session and external resources.",
      "  unblockWhen: Read the latest output, form a new root-cause hypothesis, or change the implementation, parameters, or environment before verifying again.",
      "  recovery: Fix the root cause and rerun; append `# retry-ok` when the repetition is intentional.",
      "",
      "This block cleared the command's repetition cycle; start a new cycle after fixing the cause.",
    );
  } else {
    lines.push(
      `${Math.max(0, blockAt - streak)} more repetition(s) will trigger a block.`,
      "Inspect the previous output first and confirm that another run can produce new evidence.",
    );
  }
  return lines.join("\n");
}

function pollingMessage(action, command, sleepSum, querySum, settings) {
  const lines = [
    `[Execution Loop Guard] Remote polling budget exceeded: approximately ${Math.round(sleepSum)}s of sleep and ${querySum} status queries in the last ${settings.windowMinutes} minutes`,
    `Current command: ${String(command).trim().slice(0, 160)}`,
    "",
  ];
  if (action === "block") {
    lines.push(
      "blockingContract:",
      "  observedFacts: Remote status queries or explicit sleeps reached the current window budget.",
      "  harm: Polling without a termination condition continually consumes session, runner, and remote API resources.",
      "  unblockWhen: Use a supervised flow with a total budget, backoff, and termination condition, or take one status snapshot.",
      "  recovery: Append `# poll-ok` when the wait is intentional; that command will not count toward the budget.",
    );
  } else {
    lines.push(
      "Use a supervised flow with a total budget, backoff, and termination condition; run one status query when only a snapshot is needed.",
      "Append `# poll-ok` when the wait is intentional; that command will not count toward the budget.",
    );
  }
  return lines.join("\n");
}

function runPre(event, config, repoRoot, cwd) {
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
      const inputFingerprint = commandInputFingerprint(command, cwd, repoRoot);
      const previous = state.command && now - Number(state.command.lastSeen) <= repeat.windowMinutes * 60_000
        ? state.command
        : null;
      if (previous?.commandHash === normalizedHash && (previous.inputFingerprint ?? null) === inputFingerprint) {
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

function recordCommandOutcome(event, config, forceFailure, repoRoot, cwd) {
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
    const inputFingerprint = commandInputFingerprint(command, cwd, repoRoot);
    const previous = state.command &&
      now - Number(state.command.lastSeen) <= config.commandRepeat.windowMinutes * 60_000 &&
      state.command.commandHash === normalizedHash &&
      (state.command.inputFingerprint ?? null) === inputFingerprint
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
      inputFingerprint,
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
    `[Execution Loop Guard] ${action === "block" ? "Edit loop blocked" : "High-frequency edits detected"}`,
    "",
    ...findings.map((finding) => `- ${finding.path}: ${finding.count} edit(s) in the last ${settings.windowMinutes} minutes`),
    "",
  ];
  if (action === "block") {
    lines.push(
      "blockingContract:",
      "  observedFacts: The same file reached the edit blocking threshold within the rolling window.",
      "  harm: Repeated small edits usually indicate an unstable root cause, incomplete file understanding, or missing verification feedback.",
      "  unblockWhen: Reread the complete file, diff, and verification output, then form a falsifiable hypothesis and minimal change.",
      "  recovery: Run relevant verification or revise the plan first; successful verification clears this session's edit counts.",
      "",
      "The blocked files' count cycles were cleared; the next edit starts a new cycle.",
    );
  } else {
    lines.push(`The guard blocks at ${settings.blockAt} edits; a successful test, lint, typecheck, or other verification command clears this session's edit counts.`);
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
    runPre(event, config, repoRoot, cwd);
    return;
  }
  recordCommandOutcome(event, config, mode === "failure", repoRoot, cwd);
  if (mode === "post") recordEdits(event, config, repoRoot, cwd);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    warn(`hook failed open: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(0);
  });
}
