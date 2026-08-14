#!/usr/bin/env node

import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProjectConfig } from "./lib/config.mjs";
import {
  contextOutput,
  extractAssistantMessage,
  extractCwd,
  extractFileTargets,
  extractPrompt,
  extractShellCommand,
  isFileMutationTool,
  isShellTool,
  preToolDeny,
  readStdinJson,
  stopDeny,
  writeJson,
} from "./lib/hook-io.mjs";
import { loadAndValidateLedger } from "./lib/ledger.mjs";
import {
  applyClassification,
  classifyInjectText,
  classifyUserInput,
  extractShellMutationTargets,
  isExpired,
  isLedgerArtifactPath,
  isLedgerPath,
  isProtectedStatePath,
  isSessionBoundLedger,
  ledgerBlockMessage,
  looksLikeCompletionClaim,
  looksLikeImplementClaim,
  matchEntry,
  openFromEntry,
  protocolInjectText,
  sessionBoundFindings,
  shellLooksMutating,
  shellWriteDecision,
  shouldReportWrite,
  softLedgerReport,
  stateProtectMessage,
  writeBlockActive,
  writeDenyMessage,
} from "./lib/policy.mjs";
import { readState, resolveProjectRoot, updateState } from "./lib/state-store.mjs";

const MAX_STOP_BLOCKS = 2;

function warn(message) {
  process.stderr.write(`[first-principles-gate] ${message}\n`);
}

function resolveRepoRoot(cwd) {
  return resolveProjectRoot(cwd);
}

function relativeToRoot(absPath, repoRoot, cwd) {
  const base = repoRoot ?? cwd;
  const candidate = relative(base, absPath).replaceAll("\\", "/");
  return candidate.startsWith("../") ? absPath.replaceAll("\\", "/") : candidate;
}

function resolveShellTarget(target, cwd) {
  const text = String(target ?? "").trim();
  if (!text) return resolve(cwd);
  if (isAbsolute(text)) return resolve(text);
  return resolve(cwd, text.replace(/^\.\//u, ""));
}

function expireIfNeeded(state, config, now = Date.now()) {
  if (isExpired(state, config.sessionTtlHours, now)) {
    state.phase = "idle";
    state.closeReason = "ttl";
    state.stopAttempts = 0;
  }
  return state;
}

function persistExpiry(event, config) {
  updateState(event, (s) => {
    if (isExpired(s, config.sessionTtlHours)) {
      s.phase = "idle";
      s.closeReason = "ttl";
      s.stopAttempts = 0;
    }
  });
}

function stateProtectionHits(event, cwd, repoRoot) {
  const hits = [];
  if (isFileMutationTool(event)) {
    for (const abs of extractFileTargets(event)) {
      const rel = relativeToRoot(abs, repoRoot, cwd);
      if (isProtectedStatePath(rel)) hits.push(rel);
    }
    return hits;
  }
  if (!isShellTool(event)) return hits;
  const command = extractShellCommand(event);
  if (!command || !shellLooksMutating(command)) return hits;
  const targets = extractShellMutationTargets(command);
  for (const target of targets) {
    const rel = relativeToRoot(resolveShellTarget(target, cwd), repoRoot, cwd);
    if (isProtectedStatePath(rel)) hits.push(rel);
  }
  if (
    targets.length === 0 &&
    /(?:^|[/"'\s])\.first-principles\/\.state(?:\/|$)/u.test(command)
  ) {
    hits.push(".first-principles/.state");
  }
  return hits;
}

/**
 * Prefer session cwd (fixture / nested workspace), then git root.
 */
function loadLedger(cwd, repoRoot, config) {
  const primary = loadAndValidateLedger(cwd, config);
  if (primary.valid || primary.present) return primary;
  if (repoRoot && resolve(repoRoot) !== resolve(cwd)) {
    const secondary = loadAndValidateLedger(repoRoot, config);
    if (secondary.present) return secondary;
  }
  return primary;
}

function creditLedgerRevision(event, config, check) {
  updateState(event, (state) => {
    expireIfNeeded(state, config);
    if (!check?.present) return;
    state.ledgerPath = check.relativePath;
    state.ledgerRevision = Number(state.ledgerRevision || 0) + 1;
    state.ledgerValid = Boolean(check.valid);
  });
}

function runPrompt(event, config) {
  const prompt = extractPrompt(event);
  const contexts = [];

  const result = updateState(event, (state) => {
    expireIfNeeded(state, config);
    const entry = matchEntry(prompt, config.entryTokens);
    if (entry) {
      Object.assign(state, openFromEntry(state, entry));
      contexts.push(protocolInjectText(entry.topic));
      return { kind: "entry", entry };
    }

    if (state.phase !== "open") {
      return { kind: "idle" };
    }

    const classification = classifyUserInput(prompt, state, config);
    Object.assign(state, applyClassification(state, classification));
    const inject = classifyInjectText(classification);
    if (inject) contexts.push(inject);
    return { kind: "classify", classification };
  });

  if (!result || result.kind === "idle") return;
  if (contexts.length === 0) return;
  writeJson(contextOutput("UserPromptSubmit", contexts.join("\n\n")));
}

function runPre(event, config) {
  const cwd = extractCwd(event);
  const repoRoot = resolveRepoRoot(cwd);
  if (stateProtectionHits(event, cwd, repoRoot).length > 0) {
    writeJson(preToolDeny(stateProtectMessage()));
    return;
  }

  const state = readState(event);
  expireIfNeeded(state, config);
  if (state.closeReason === "ttl" && state.phase === "idle") {
    persistExpiry(event, config);
  }

  const live = readState(event);
  expireIfNeeded(live, config);
  if (!writeBlockActive(live.phase, config) && !shouldReportWrite(live.phase, config)) {
    return;
  }

  const reasons = [];

  if (isFileMutationTool(event)) {
    const targets = extractFileTargets(event);
    if (targets.length === 0) {
      reasons.push("file mutation tool without resolvable path");
    }
    for (const abs of targets) {
      const rel = relativeToRoot(abs, repoRoot, cwd);
      if (!isLedgerPath(rel, config)) {
        reasons.push(rel);
      }
    }
  } else if (isShellTool(event)) {
    const command = extractShellCommand(event);
    if (command) {
      const decision = shellWriteDecision(command, config, (target) =>
        relativeToRoot(resolveShellTarget(target, cwd), repoRoot, cwd),
      );
      if (decision.deny) reasons.push(...decision.reasons);
    }
  } else {
    return;
  }

  if (reasons.length === 0) return;

  const message = writeDenyMessage();
  if (writeBlockActive(live.phase, config)) {
    writeJson(preToolDeny(message));
    return;
  }
  if (shouldReportWrite(live.phase, config)) {
    writeJson(contextOutput("PreToolUse", message));
  }
}

function runPost(event, config) {
  const live = readState(event);
  expireIfNeeded(live, config);
  if (live.phase !== "open" && live.phase !== "closed") return;

  const cwd = extractCwd(event);
  const repoRoot = resolveRepoRoot(cwd);

  if (isFileMutationTool(event)) {
    const targets = extractFileTargets(event);
    // Only credit revision when an allowlisted *ledger file* is written.
    // mkdir on `.first-principles` alone must not bind a stale ledger.
    const ledgerFileTouch = targets.some((abs) =>
      isLedgerArtifactPath(relativeToRoot(abs, repoRoot, cwd), config),
    );
    if (!ledgerFileTouch) return;
    const check = loadLedger(cwd, repoRoot, config);
    creditLedgerRevision(event, config, check);
    return;
  }

  if (isShellTool(event)) {
    const command = extractShellCommand(event);
    if (!command || !shellLooksMutating(command)) return;
    const targets = extractShellMutationTargets(command);
    if (targets.length === 0) return;
    const ledgerFileTouch = targets.some((target) =>
      isLedgerArtifactPath(
        relativeToRoot(resolveShellTarget(target, cwd), repoRoot, cwd),
        config,
      ),
    );
    if (!ledgerFileTouch) return;
    const check = loadLedger(cwd, repoRoot, config);
    creditLedgerRevision(event, config, check);
  }
}

function runStop(event, config) {
  const message = extractAssistantMessage(event);
  const cwd = extractCwd(event);
  const repoRoot = resolveRepoRoot(cwd);
  const stopMode = config.stopGate?.mode ?? "block";
  if (stopMode === "off") return;

  const check = loadLedger(cwd, repoRoot, config);
  const completionClaim = looksLikeCompletionClaim(message);
  const implementClaim = looksLikeImplementClaim(message);

  const outcome = updateState(event, (state) => {
    expireIfNeeded(state, config);

    if (check.present) {
      state.ledgerPath = check.relativePath;
      // Do not set ledgerValid true solely from on-disk structure; session binding is required.
      state.ledgerValid = isSessionBoundLedger(check, state);
    }

    if (state.phase === "idle") {
      return { kind: "skip" };
    }

    if (state.phase === "open" && implementClaim && config.stopGate.blockImplementWhileOpen) {
      return { kind: "block_implement" };
    }

    const requiresLedger =
      (state.phase === "closed" && state.closeReason === "completed") ||
      (state.phase === "open" && completionClaim);

    const boundOk = isSessionBoundLedger(check, state);
    const findings = sessionBoundFindings(check, state);
    if (requiresLedger && !boundOk) {
      state.stopAttempts = Number(state.stopAttempts || 0) + 1;
      if (state.stopAttempts > MAX_STOP_BLOCKS) {
        return { kind: "fail_open", findings };
      }
      return { kind: "block_ledger", findings };
    }

    if (state.phase === "open" && !completionClaim && config.stopGate.softReportWhileOpen) {
      if (!boundOk) {
        return { kind: "soft", findings };
      }
    }

    if (requiresLedger && boundOk) {
      state.ledgerValid = true;
      state.stopAttempts = 0;
    }

    return { kind: "ok" };
  });

  if (!outcome || outcome.kind === "skip" || outcome.kind === "ok") return;

  if (outcome.kind === "block_implement") {
    const body = [
      "[first-principles-gate] First-principles mode is still open (phase=open); do not begin implementation.",
      "Continue writing `.first-principles/ledger.json`; modify business code only after the user replies `done` or sends `# first-principles-abort`.",
    ].join("\n");
    if (stopMode === "block") {
      writeJson(stopDeny(body));
    } else {
      writeJson(contextOutput("Stop", body));
    }
    return;
  }

  if (outcome.kind === "block_ledger") {
    const body = ledgerBlockMessage(outcome.findings);
    if (stopMode === "block") {
      writeJson(stopDeny(body));
    } else {
      writeJson(contextOutput("Stop", body));
    }
    return;
  }

  if (outcome.kind === "fail_open") {
    writeJson(
      contextOutput(
        "Stop",
        [
          "[first-principles-gate] Stop gate fail-open after repeated ledger blocks.",
          softLedgerReport(outcome.findings),
        ].join("\n"),
      ),
    );
    return;
  }

  if (outcome.kind === "soft") {
    writeJson(contextOutput("Stop", softLedgerReport(outcome.findings)));
  }
}

async function main() {
  const mode = process.argv[2] ?? "prompt";
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);

  const cwd = extractCwd(event);
  const repoRoot = resolveRepoRoot(cwd);
  const config = await loadProjectConfig(repoRoot, warn);

  try {
    if (mode === "prompt" || mode === "user-prompt" || mode === "UserPromptSubmit") {
      runPrompt(event, config);
    } else if (mode === "pre" || mode === "PreToolUse") {
      runPre(event, config);
    } else if (mode === "post" || mode === "PostToolUse") {
      runPost(event, config);
    } else if (mode === "stop" || mode === "Stop") {
      runStop(event, config);
    } else {
      warn(`unknown mode: ${mode}`);
    }
  } catch (error) {
    warn(error?.message ?? String(error));
  }
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}

export {
  runPost,
  runPre,
  runPrompt,
  runStop,
  resolveRepoRoot,
};
