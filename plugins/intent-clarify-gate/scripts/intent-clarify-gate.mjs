#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";
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
import {
  applyClassification,
  classifyInjectText,
  classifyUserInput,
  isExpired,
  isLedgerPath,
  isProtectedStatePath,
  looksLikeImplementClaim,
  matchEntry,
  openFromEntry,
  parseCompleteOptions,
  protocolInjectText,
  shellLooksMutating,
  shouldReportWrite,
  stateProtectMessage,
  writeBlockActive,
  writeDenyMessage,
} from "./lib/policy.mjs";
import { emptyState, readState, updateState } from "./lib/state-store.mjs";

function warn(message) {
  process.stderr.write(`[intent-clarify-gate] ${message}\n`);
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
  if (/(?:^|[/"'\s])\.grill-ledgers\/\.state(?:\/|$)/u.test(command)) {
    hits.push(".grill-ledgers/.state");
  }
  return hits;
}

function expireIfNeeded(state, config, now = Date.now()) {
  if (isExpired(state, config.sessionTtlHours, now)) {
    state.phase = "idle";
    state.closeReason = "ttl";
    state.completeOffered = false;
    state.completeChoice = null;
  }
  return state;
}

function runPrompt(event, config) {
  const prompt = extractPrompt(event);
  const contexts = [];

  const result = updateState(event, (state) => {
    expireIfNeeded(state, config);
    const entry = matchEntry(prompt, config.entryTokens);
    if (entry) {
      Object.assign(state, openFromEntry(state, entry));
      contexts.push(protocolInjectText());
      return { kind: "entry", entry };
    }

    if (state.phase !== "open") {
      return { kind: "idle" };
    }

    const classification = classifyUserInput(prompt, state, config);
    Object.assign(state, applyClassification(state, classification));
    const inject = classifyInjectText(classification, state);
    if (inject && (classification.class !== "constraint" || config.constraintInject)) {
      contexts.push(inject);
    }
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
  // Persist TTL expiry if needed
  if (state.closeReason === "ttl" && state.phase === "idle") {
    updateState(event, (s) => {
      if (isExpired(s, config.sessionTtlHours)) {
        s.phase = "idle";
        s.closeReason = "ttl";
      }
    });
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
      // Unknown write path — fail closed while open for safety on explicit write tools
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
    if (command && shellLooksMutating(command)) {
      reasons.push(`mutating shell: ${command.slice(0, 120)}`);
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

function runStop(event, config) {
  const message = extractAssistantMessage(event);
  const contexts = [];

  const outcome = updateState(event, (state) => {
    expireIfNeeded(state, config);
    if (state.phase !== "open") return { kind: "skip" };

    const parsed = parseCompleteOptions(message);
    state.completeOffered = parsed.completeOffered;
    state.completeChoice = parsed.completeChoice;
    if (parsed.multiComplete) {
      contexts.push(
        "[intent-clarify-gate] Multiple Done options detected; keep exactly one `N. Done — …` option.",
      );
    }

    if (
      !parsed.completeOffered &&
      Number(state.turnIndex) >= Number(config.stopGate.remindCompleteOptionAfterRounds)
    ) {
      contexts.push(
        `[intent-clarify-gate] ${state.turnIndex} question rounds are complete; if the critical path is clear, include \`N. Done — …\` among the 1/2/3 options.`,
      );
    }

    if (
      config.stopGate.blockImplementWhileOpen &&
      looksLikeImplementClaim(message)
    ) {
      return { kind: "block_implement" };
    }

    return { kind: "ok", parsed };
  });

  if (outcome?.kind === "block_implement") {
    writeJson(
      stopDeny(
        [
          "[intent-clarify-gate] The interview is still open (phase=open); do not begin implementation.",
          "Continue with 1/2/3 questions and include `N. Done — …` once the path is clear. Modify code only after the user replies `done` or selects the Done option.",
        ].join("\n"),
      ),
    );
    return;
  }

  if (contexts.length > 0) {
    writeJson(contextOutput("Stop", contexts.join("\n")));
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
    } else if (mode === "stop" || mode === "Stop") {
      runStop(event, config);
    } else {
      warn(`unknown mode: ${mode}`);
    }
  } catch (error) {
    // Fail-open on unexpected errors (never permanent lock).
    warn(error?.message ?? String(error));
  }
}

const isMain = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}

export {
  runPre,
  runPrompt,
  runStop,
  resolveRepoRoot,
};
