#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";

import { loadProjectConfig } from "./lib/config.mjs";
import {
  parseCompletionTrailer,
  validateTrailerAgainstTrail,
} from "./lib/completion-trailer.mjs";
import {
  contextOutput,
  extractAssistantMessage,
  extractCwd,
  extractFileTargets,
  extractPrompt,
  extractSessionId,
  extractShellCommand,
  isFileMutationTool,
  isShellTool,
  preToolDeny,
  readStdinJson,
  stopDeny,
  writeJson,
} from "./lib/hook-io.mjs";
import {
  classifyGoalPrompt,
  clearInjectText,
  isExpired,
  isProtectedTrailFile,
  looksLikeCompletionClaim,
  protocolInjectText,
  shellTouchesProtectedTrail,
  supersedeInjectText,
} from "./lib/policy.mjs";
import { readState, updateState } from "./lib/state-store.mjs";
import {
  auditPaths,
  createRun,
  ensureGitignore,
  finalizeRunMeta,
  makeRunId,
  trailTipSummary,
  writeCurrent,
} from "./lib/trail.mjs";

const MAX_STOP_BLOCKS = 2;

function warn(message) {
  process.stderr.write(`[goal-task-gate] ${message}\n`);
}

function resolveRepoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return resolve(cwd);
  }
}

function relativeToRoot(absPath, repoRoot, cwd) {
  const base = repoRoot ?? cwd;
  const candidate = relative(base, absPath).replaceAll("\\", "/");
  return candidate.startsWith("../") ? absPath.replaceAll("\\", "/") : candidate;
}

function detectHost() {
  if (process.env.CLAUDE_PLUGIN_ROOT && !process.env.PLUGIN_ROOT) return "claude";
  if (process.env.PLUGIN_ROOT) return "codex";
  return "unknown";
}

function pluginRootHint() {
  return (
    process.env.CLAUDE_PLUGIN_ROOT ||
    process.env.PLUGIN_ROOT ||
    "<plugin-root>"
  );
}

function expireIfNeeded(state, config, now = Date.now()) {
  if (isExpired(state, config.sessionTtlHours, now)) {
    state.phase = "idle";
    state.lastCloseReason = "ttl";
    state.runId = null;
    state.objective = null;
    state.stopAttempts = 0;
  }
  return state;
}

function armRun(event, config, objective, { supersededFrom = null } = {}) {
  const cwd = extractCwd(event);
  const repoRoot = resolveRepoRoot(cwd);
  const sessionId = extractSessionId(event);
  const runId = makeRunId();
  const openWhy = supersededFrom
    ? `supersedes=${supersededFrom}`
    : "goal armed from /goal prompt";

  if (config.gitignoreEnsure) {
    ensureGitignore(repoRoot);
  }

  if (supersededFrom) {
    const oldPaths = auditPaths(repoRoot, config.auditRoot, supersededFrom);
    finalizeRunMeta(oldPaths.metaPath, {
      status: "superseded",
      supersededBy: runId,
      endedAt: new Date().toISOString(),
    });
  }

  const { paths, meta } = createRun(repoRoot, {
    auditRoot: config.auditRoot,
    runId,
    objective,
    sessionId,
    host: detectHost(),
    tipWindow: config.tipWindow,
    openWhy,
    writeOpenRow: true,
  });

  return {
    runId,
    objective,
    paths,
    meta,
    repoRoot,
    inject: protocolInjectText({
      runId,
      objective,
      auditRoot: config.auditRoot,
      tipWindow: config.tipWindow,
      pluginRootHint: pluginRootHint(),
      supersededFrom,
    }),
    supersedeNote: supersededFrom
      ? supersedeInjectText(supersededFrom, runId)
      : null,
  };
}

function clearArmed(event, config, runId) {
  const cwd = extractCwd(event);
  const repoRoot = resolveRepoRoot(cwd);
  if (runId) {
    const paths = auditPaths(repoRoot, config.auditRoot, runId);
    finalizeRunMeta(paths.metaPath, {
      status: "cleared",
      endedAt: new Date().toISOString(),
    });
  }
  writeCurrent(resolve(repoRoot, config.auditRoot, "CURRENT"), null);
}

function runPrompt(event, config) {
  const prompt = extractPrompt(event);
  const classification = classifyGoalPrompt(prompt, config);
  const contexts = [];

  updateState(event, (state) => {
    expireIfNeeded(state, config);

    if (classification.class === "abort") {
      if (state.phase === "armed" && state.runId) {
        clearArmed(event, config, state.runId);
        contexts.push(clearInjectText(state.runId));
      }
      state.phase = "idle";
      state.runId = null;
      state.objective = null;
      state.lastCloseReason = "aborted";
      state.stopAttempts = 0;
      return;
    }

    if (classification.class === "clear") {
      if (state.phase === "armed" && state.runId) {
        clearArmed(event, config, state.runId);
        contexts.push(clearInjectText(state.runId));
      }
      state.phase = "idle";
      state.runId = null;
      state.objective = null;
      state.lastCloseReason = "cleared";
      state.stopAttempts = 0;
      return;
    }

    if (classification.class === "ignore") {
      return;
    }

    if (classification.class === "arm") {
      const oldRun = state.phase === "armed" ? state.runId : null;
      const armed = armRun(event, config, classification.objective, {
        supersededFrom: oldRun,
      });
      state.phase = "armed";
      state.runId = armed.runId;
      state.objective = classification.objective;
      state.enteredAt = Date.now();
      state.lastCloseReason = oldRun ? "superseded" : "armed";
      state.stopAttempts = 0;
      if (armed.supersedeNote) contexts.push(armed.supersedeNote);
      contexts.push(armed.inject);
      return;
    }

    // other: if armed, optionally re-inject short reminder (skip to save tokens)
  });

  if (contexts.length === 0) return;
  writeJson(contextOutput("UserPromptSubmit", contexts.join("\n\n")));
}

function runPre(event, config) {
  const state = readState(event);
  expireIfNeeded(state, config);
  if (state.phase !== "armed") return;

  const cwd = extractCwd(event);
  const repoRoot = resolveRepoRoot(cwd);

  if (isFileMutationTool(event)) {
    const targets = extractFileTargets(event);
    for (const abs of targets) {
      const rel = relativeToRoot(abs, repoRoot, cwd);
      if (isProtectedTrailFile(rel, config.auditRoot)) {
        writeJson(
          preToolDeny(
            `[goal-task-gate] deny direct edit of audit trail ${rel}. Use log-decision.mjs / log-work.mjs only (append or --rewrite-tip ≤ ${config.tipWindow}).`,
          ),
        );
        return;
      }
    }
    return;
  }

  if (isShellTool(event)) {
    const command = extractShellCommand(event);
    if (!command) return;
    // Never early-return on helper name substring — compounds can smuggle mutations.
    // shellTouchesProtectedTrail allows only pure node …/log-decision|log-work.mjs.
    if (shellTouchesProtectedTrail(command, config.auditRoot)) {
      writeJson(
        preToolDeny(
          `[goal-task-gate] deny shell mutation of decisions.tsv/work.jsonl. Use pure log-decision.mjs / log-work.mjs only.`,
        ),
      );
    }
  }
}

function runStop(event, config) {
  const assistant = extractAssistantMessage(event);
  const trailer = parseCompletionTrailer(assistant);

  const result = updateState(event, (state) => {
    expireIfNeeded(state, config);
    if (state.phase !== "armed" || !state.runId) {
      return { kind: "idle" };
    }

    const cwd = extractCwd(event);
    const repoRoot = resolveRepoRoot(cwd);
    const paths = auditPaths(repoRoot, config.auditRoot, state.runId);
    const tip = trailTipSummary(paths.decisionsPath, state.runId);

    if (trailer) {
      const check = validateTrailerAgainstTrail(trailer, {
        runId: state.runId,
        closeSeq: tip.closeSeq,
        tipHash: tip.tipHash,
        kind: tip.kind,
        chainValid: tip.chainValid,
      });
      if (!tip.hasClose || tip.kind !== "close") {
        check.ok = false;
        check.findings.push("need decisions.tsv tip row kind=close");
      }
      if (tip.rowCount < config.minRows) {
        check.ok = false;
        check.findings.push(`need at least ${config.minRows} decision rows`);
      }
      if (!check.ok) {
        state.stopAttempts = Number(state.stopAttempts || 0) + 1;
        return {
          kind: "block-trailer",
          findings: check.findings,
          runId: state.runId,
          stopAttempts: state.stopAttempts,
        };
      }
      finalizeRunMeta(paths.metaPath, {
        status: "completed",
        endedAt: new Date().toISOString(),
        decisionCount: tip.rowCount,
        tipHash: tip.tipHash,
      });
      writeCurrent(paths.currentPath, null);
      state.phase = "idle";
      state.runId = null;
      state.objective = null;
      state.lastCloseReason = "completed";
      state.stopAttempts = 0;
      return { kind: "completed", runId: tip.runId };
    }

    if (looksLikeCompletionClaim(assistant) && config.stopGate.mode !== "off") {
      state.stopAttempts = Number(state.stopAttempts || 0) + 1;
      return {
        kind: "claim-without-trailer",
        runId: state.runId,
        tip,
        stopAttempts: state.stopAttempts,
      };
    }

    if (
      config.stopGate.softSparseWhileArmed &&
      tip.rowCount <= config.stopGate.sparseMinRows
    ) {
      return { kind: "soft-sparse", runId: state.runId, tip };
    }

    return { kind: "continue", runId: state.runId, tip };
  });

  if (!result || result.kind === "idle" || result.kind === "continue") return;
  if (result.kind === "completed") {
    writeJson(
      contextOutput(
        "Stop",
        `[goal-task-gate] completed run_id=${result.runId}. Trail sealed.`,
      ),
    );
    return;
  }

  if (result.kind === "soft-sparse") {
    writeJson(
      contextOutput(
        "Stop",
        `[goal-task-gate] armed run_id=${result.runId} has sparse trail (rows=${result.tip.rowCount}). Log decisions via log-decision.mjs. On finish: kind=close + GOAL_TASK_DONE trailer.`,
      ),
    );
    return;
  }

  const soft = config.softOnly || config.stopGate.mode === "report";
  const attempts = result.stopAttempts ?? 0;
  if (attempts > MAX_STOP_BLOCKS) {
    writeJson(
      contextOutput(
        "Stop",
        `[goal-task-gate] stop-block budget exceeded; fail-open. Fix trail: ${result.findings?.join("; ") ?? result.kind}`,
      ),
    );
    updateState(event, (s) => {
      s.stopAttempts = 0;
    });
    return;
  }

  if (result.kind === "block-trailer") {
    const reason = `[goal-task-gate] GOAL_TASK_DONE rejected for run_id=${result.runId}: ${result.findings.join("; ")}. Append kind=close via log-decision.mjs, then trailer with matching close_seq and tip_hash.`;
    if (soft || config.stopGate.mode === "off") {
      writeJson(contextOutput("Stop", reason));
    } else {
      writeJson(stopDeny(reason));
    }
    return;
  }

  if (result.kind === "claim-without-trailer") {
    const reason = `[goal-task-gate] completion claim without GOAL_TASK_DONE. Append kind=close via log-decision.mjs for run_id=${result.runId}, then end with: GOAL_TASK_DONE run_id=${result.runId} status=completed close_seq=<n> tip_hash=<hash>`;
    if (soft || config.stopGate.mode === "report") {
      writeJson(contextOutput("Stop", reason));
    } else if (config.stopGate.mode === "block") {
      writeJson(stopDeny(reason));
    }
  }
}

async function main() {
  const mode = process.argv[2] || "prompt";
  const event = await readStdinJson();
  if (event.__parseError) {
    warn("stdin JSON parse failed; fail-open");
    return;
  }

  const cwd = extractCwd(event);
  const repoRoot = resolveRepoRoot(cwd);
  const config = await loadProjectConfig(repoRoot, warn);

  if (mode === "prompt") {
    runPrompt(event, config);
    return;
  }
  if (mode === "pre") {
    runPre(event, config);
    return;
  }
  if (mode === "stop") {
    runStop(event, config);
    return;
  }
  if (mode === "post") {
    // reserved for phase-2 auto work lines
    return;
  }
  warn(`unknown mode: ${mode}`);
}

main().catch((error) => {
  warn(error?.stack ?? String(error));
  process.exitCode = 0; // fail-open
});
