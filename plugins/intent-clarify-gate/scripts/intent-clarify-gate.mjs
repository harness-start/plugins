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
  looksLikeImplementClaim,
  matchEntry,
  openFromEntry,
  parseCompleteOptions,
  protocolInjectText,
  shellLooksMutating,
  shouldReportWrite,
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
    const inject = classifyInjectText(classification);
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

  const cwd = extractCwd(event);
  const repoRoot = resolveRepoRoot(cwd);
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
        "[intent-clarify-gate] 检测到多个「完成」选项，请只保留一项「N. 完成 — …」。",
      );
    }

    if (
      !parsed.completeOffered &&
      Number(state.turnIndex) >= Number(config.stopGate.remindCompleteOptionAfterRounds)
    ) {
      contexts.push(
        `[intent-clarify-gate] 已进行 ${state.turnIndex} 轮选题，若关键路径已摸清，请在 1/2/3 中加入「N. 完成 — …」。`,
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
          "[intent-clarify-gate] 访谈尚未结束（phase=open），不要开始实现。",
          "请继续出 1/2/3；路径摸清时加入「N. 完成 — …」。用户回复「完成」或选中完成项后再改代码。",
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
