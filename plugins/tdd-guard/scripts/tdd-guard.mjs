#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  contextOutput,
  cwdOf,
  extractTargets,
  inferOutcome,
  preToolDeny,
  proposedContent,
  readStdinJson,
  relativePath,
  sessionIdOf,
  shellCommandOf,
  stopDeny,
  toolUseIdOf,
  writeJson,
} from "./lib/hook-io.mjs";
import {
  formatTestPathList,
  historicalCorrespondingTests,
} from "./lib/existing-tests.mjs";
import {
  classifyPath,
  expectedTestExample,
  extractTestEvidence,
  resolveLanguageContext,
  sourceAuthorizedByTest,
} from "./lib/patterns.mjs";
import { digest, readState, writeState } from "./lib/state-store.mjs";

function warn(message) { process.stderr.write(`[tdd-guard] ${message}\n`); }
function readText(path) { try { return readFileSync(path, "utf8"); } catch { return ""; } }
function hashPath(path) { return existsSync(path) ? digest(readText(path)) : "missing"; }

function targetsFor(event, root) {
  return extractTargets(event).map((absolutePath) => {
    const path = relativePath(root, absolutePath);
    return { absolutePath, path, ...classifyPath(path) };
  }).filter((target) => target.kind !== "ignored");
}

function liveTestRecords(state, root) {
  return (state.tests ?? []).filter((record) => hashPath(resolve(root, record.path)) === record.hash);
}

function mixedWriteFinding() {
  return "[TDD Guard] A single tool call cannot mix test and implementation files. Use separate tool calls: write the test first, let the hook record it, then write implementation files.";
}

function testCommand(command) {
  return /(?:^|[;&|]\s*)(?:[^\s]+\/)?(?:node\s+--test|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|pytest|python(?:3)?\s+-m\s+pytest|phpunit|vendor\/bin\/phpunit|go\s+test|cargo\s+test|jest|vitest)\b/iu.test(String(command ?? ""));
}

function coveredTests(command, tests) {
  const normalized = String(command ?? "").replaceAll("\\", "/");
  const mentioned = tests.filter((record) => normalized.includes(record.path));
  if (mentioned.length > 0) return mentioned;
  const namesAFile = /(?:^|\s)["']?(?:\.\/|\/)?[^\s;|"']*(?:Test\.php|_test\.go|test_[^/\s"']+\.py|\.(?:test|spec)\.[cm]?[jt]sx?|\.rs)["']?(?=\s|$)/u.test(normalized);
  if (namesAFile || /\b(?:--list-tests|--collect-only|--listTests)\b/u.test(normalized)) return [];
  return testCommand(normalized) ? tests : [];
}

async function runPre(event) {
  const root = cwdOf(event);
  const sessionId = sessionIdOf(event);
  const targets = targetsFor(event, root);
  if (targets.length === 0) return;
  const kinds = new Set(targets.map((target) => target.kind));
  if (kinds.has("test") && kinds.has("source")) {
    writeJson(preToolDeny(mixedWriteFinding()));
    return;
  }

  const state = readState(sessionId, root);
  if (kinds.has("source")) {
    if (state.needsGreen) {
      writeJson(preToolDeny(`[TDD Guard] Blocked implementation edit: the previous implementation mutation still needs an observed passing test run (GREEN). Run the relevant tests successfully before another implementation change.`));
      return;
    }
    const tests = liveTestRecords(state, root);
    const authorizingTests = new Set();
    for (const target of targets) {
      const current = readText(target.absolutePath);
      const source = { ...target, content: proposedContent(event, target.absolutePath, current) };
      const context = resolveLanguageContext(root, target.path, target.language);
      const historical = historicalCorrespondingTests(root, source, state, context);
      if (historical.length > 0) {
        const eligible = tests.filter((record) => historical.includes(record.path) && record.redHash === record.hash && sourceAuthorizedByTest(source, record, context));
        if (eligible.length > 0) {
          for (const record of eligible) authorizingTests.add(record.path);
          continue;
        }
        writeJson(preToolDeny(`[TDD Guard] Blocked ${target.path}: matching tests already exist (${formatTestPathList(historical)}), but no current failing test run (RED) was observed after their latest edit. Run the relevant tests, confirm they fail for the intended behavior, then retry the implementation edit.`));
        return;
      }
      const eligible = tests.filter((record) => record.redHash === record.hash && sourceAuthorizedByTest(source, record, context));
      if (eligible.length > 0) {
        for (const record of eligible) authorizingTests.add(record.path);
        continue;
      }
      const expected = expectedTestExample(target.path, target.language);
      writeJson(preToolDeny(`[TDD Guard] Blocked ${target.path}: no matching edited test with an observed failing run (RED) is available. Create or update ${expected} with a real test case, run it and observe the intended failure, then retry.`));
      return;
    }
    state.pending = {
      kind: "source",
      toolUseId: toolUseIdOf(event),
      targets: targets.map((target) => ({ path: target.path, beforeHash: hashPath(target.absolutePath) })),
      testPaths: [...authorizingTests],
    };
    if (!writeState(sessionId, root, state)) warn("implementation snapshot could not be persisted; GREEN completion will fail closed");
    return;
  }

  state.pending = {
    kind: "test",
    toolUseId: toolUseIdOf(event),
    targets: targets.map((target) => ({ path: target.path, language: target.language, beforeHash: hashPath(target.absolutePath) })),
  };
  if (!writeState(sessionId, root, state)) warn("test write snapshot could not be persisted; later implementation writes will remain blocked");
}

async function runPost(event, platform, forceFailure = false) {
  const root = cwdOf(event);
  const sessionId = sessionIdOf(event);
  const state = readState(sessionId, root);
  const command = shellCommandOf(event);
  if (command && testCommand(command)) {
    const tests = liveTestRecords(state, root);
    const relevantTests = state.needsGreen?.testPaths?.length
      ? tests.filter((record) => state.needsGreen.testPaths.includes(record.path))
      : tests;
    const covered = coveredTests(command, relevantTests);
    if (covered.length === 0) return;
    const outcome = inferOutcome(event, forceFailure);
    if (outcome === "failure" && !state.needsGreen) {
      for (const record of covered) record.redHash = record.hash;
      state.lastRed = { commandHash: digest(command), testHashes: covered.map((record) => record.hash) };
    } else if (outcome === "success" && state.needsGreen) {
      state.needsGreen = null;
    } else return;
    if (!writeState(sessionId, root, state)) warn("test outcome could not be persisted");
    return;
  }
  if (!state.pending || state.pending.toolUseId !== toolUseIdOf(event)) return;
  if (state.pending.kind === "source") {
    const testPaths = state.pending.testPaths ?? [];
    const changed = state.pending.targets.filter((target) => hashPath(resolve(root, target.path)) !== target.beforeHash).map((target) => target.path);
    state.pending = null;
    if (changed.length > 0) {
      state.needsGreen = { paths: changed, testPaths };
      for (const record of state.tests ?? []) delete record.redHash;
    }
    if (!writeState(sessionId, root, state)) warn("implementation outcome could not be persisted; GREEN completion will fail closed");
    return;
  }
  const recorded = [];
  for (const target of state.pending.targets ?? []) {
    const absolutePath = resolve(root, target.path);
    const afterHash = hashPath(absolutePath);
    state.tests = (state.tests ?? []).filter((record) => record.path !== target.path);
    if (afterHash === "missing" || afterHash === target.beforeHash) continue;
    const context = resolveLanguageContext(root, target.path, target.language);
    const evidence = extractTestEvidence(target.language, readText(absolutePath), target.path, context);
    if (!evidence.valid) continue;
    state.sequence = (state.sequence ?? 0) + 1;
    state.tests.push({
      path: target.path,
      language: target.language,
      hash: afterHash,
      sequence: state.sequence,
      created: target.beforeHash === "missing",
      evidence,
    });
    recorded.push(target.path);
  }
  state.pending = null;
  if (!writeState(sessionId, root, state)) {
    warn("test-first evidence could not be persisted; implementation writes will remain blocked");
    return;
  }
  if (recorded.length > 0 && platform !== "codex") {
    writeJson(contextOutput("PostToolUse", `[TDD Guard] Recorded test structure for ${recorded.join(", ")}. Run the relevant test command and observe the intended failure (RED) before editing implementation.`));
  }
}

async function runStop(event) {
  const root = cwdOf(event);
  const state = readState(sessionIdOf(event), root);
  if (!state.needsGreen) return;
  writeJson(stopDeny(`[TDD Guard] Completion blocked: implementation paths ${state.needsGreen.paths.join(", ")} do not yet have an observed passing test run (GREEN). Run the relevant test command successfully, then retry completion.`));
}

async function main() {
  const event = await readStdinJson();
  const mode = process.argv[2];
  const platform = process.argv[3] ?? "unknown";
  if (event.__parseError) {
    warn("hook input was not valid JSON");
    if (mode === "pre") {
      writeJson(preToolDeny("[TDD Guard] The hook could not parse this write event safely, so it was blocked. Fix the hook input, then retry."));
    }
    return;
  }
  if (mode === "pre") await runPre(event);
  else if (mode === "post" || mode === "failure") await runPost(event, platform, mode === "failure");
  else if (mode === "stop") await runStop(event);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    const mode = process.argv[2];
    warn(`hook validation failed: ${error?.message ?? error}`);
    if (mode === "pre") {
      writeJson(preToolDeny("[TDD Guard] The hook could not validate this write safely, so it was blocked. Fix the hook input or state error, then retry."));
    }
    process.exitCode = 0;
  });
}
