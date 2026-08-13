#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  contextOutput,
  cwdOf,
  extractTargets,
  preToolDeny,
  proposedContent,
  readStdinJson,
  relativePath,
  sessionIdOf,
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
    const tests = liveTestRecords(state, root);
    for (const target of targets) {
      const current = readText(target.absolutePath);
      const source = { ...target, content: proposedContent(event, target.absolutePath, current) };
      const context = resolveLanguageContext(root, target.path, target.language);
      const historical = historicalCorrespondingTests(root, source, state, context);
      if (historical.length > 0) {
        if (tests.some((record) => historical.includes(record.path) && sourceAuthorizedByTest(source, record, context))) continue;
        writeJson(preToolDeny(`[TDD Guard] Blocked ${target.path}: matching tests already exist (${formatTestPathList(historical)}). Update one of those existing test files first in this session so the change goes through a red-green cycle, then retry the implementation edit in a separate tool call.`));
        return;
      }
      if (tests.some((record) => sourceAuthorizedByTest(source, record, context))) continue;
      const expected = expectedTestExample(target.path, target.language);
      writeJson(preToolDeny(`[TDD Guard] Blocked ${target.path}: no matching test file was created or changed earlier in this session. Create or update ${expected} with a real test case that references the implementation, then retry in a separate tool call.`));
      return;
    }
    return;
  }

  state.pending = {
    toolUseId: toolUseIdOf(event),
    targets: targets.map((target) => ({ path: target.path, language: target.language, beforeHash: hashPath(target.absolutePath) })),
  };
  if (!writeState(sessionId, root, state)) warn("test write snapshot could not be persisted; later implementation writes will remain blocked");
}

async function runPost(event, platform) {
  const root = cwdOf(event);
  const sessionId = sessionIdOf(event);
  const state = readState(sessionId, root);
  if (!state.pending || state.pending.toolUseId !== toolUseIdOf(event)) return;
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
    writeJson(contextOutput("PostToolUse", `[TDD Guard] Recorded test-first evidence for ${recorded.join(", ")}. Related implementation files may now be written in a separate tool call.`));
  }
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
  else if (mode === "post") await runPost(event, platform);
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
