#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { HookEvent } from "@harness/core/hook-event";
import { isRecord } from "@harness/core/hook-event";

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
  targetOperation,
  toolUseIdOf,
  writeJson,
  type CommandOutcome,
} from "../../lib/hook-io.js";
import {
  findCorrespondingTests,
  formatTestPathList,
  historicalCorrespondingTests,
} from "../../lib/existing-tests.js";
import {
  gitPathState,
  gitShowHead,
  hasGitHead,
  listHeadPaths,
  restoresHeadState,
} from "../../lib/git-workspace.js";
import {
  classifyPath,
  expectedTestExample,
  extractTestEvidence,
  resolveLanguageContext,
  sourceAuthorizedByTest,
  type ClassifiedPath,
  type Language,
  type LanguageContext,
  type SourceLike,
} from "../../lib/patterns.js";
import { digest, readState, writeState, type GuardState } from "../../lib/state-store.js";

type ClassifiedTarget = {
  absolutePath: string;
  path: string;
} & ClassifiedPath;

type ActiveTarget = ClassifiedTarget & {
  kind: "test" | "source";
  language: Language;
};

function warn(message: string): void { process.stderr.write(`[test-driven-development] ${message}\n`); }
function readText(path: string): string { try { return readFileSync(path, "utf8"); } catch { return ""; } }
function hashPath(path: string): string { return existsSync(path) ? digest(readText(path)) : "missing"; }

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && error.message != null) return String(error.message);
  return String(error);
}

function isActiveTarget(target: ClassifiedTarget): target is ActiveTarget {
  return target.kind !== "ignored" && target.language !== null;
}

function isInsideRoot(root: string, path: string): boolean {
  const value = relative(resolve(root), resolve(path));
  return value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}

function targetsFor(event: HookEvent, root: string): ActiveTarget[] {
  return extractTargets(event).filter((absolutePath) => isInsideRoot(root, absolutePath)).map((absolutePath) => {
    const path = relativePath(root, absolutePath);
    return { absolutePath, path, ...classifyPath(path) };
  }).filter(isActiveTarget);
}

function mixedWriteFinding(): string {
  return "[TDD Guard] A single tool call cannot mix test and implementation files. Use separate tool calls: write the test first, let the hook record it, then write implementation files.";
}

function testCommand(command: string | null | undefined): boolean {
  const value = String(command ?? "");
  return (
    /(?:^|[;&|]\s*)(?:[^\s]+\/)?(?:node\s+--test|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|pytest|python(?:3)?\s+-m\s+pytest|phpunit|vendor\/bin\/phpunit|go\s+test|cargo\s+test|jest|vitest)\b/iu.test(value) ||
    /(?:^|[;&|]\s*)(?:python(?:3)?\s+)?["']?(?:\.\/|\/)?[^\s;&|"']*(?:runtests|run[-_]?tests?)\.py\b/iu.test(value) ||
    /(?:^|[;&|]\s*)python(?:3)?\s+(?:\.\/)?manage\.py\s+test\b/iu.test(value)
  );
}

const TEST_FILE_IN_COMMAND = /(?:^|\s)["']?((?:\.\/|\/)?[^\s;|"']*(?:Test\.php|_test\.go|(?:test_[^/\s"']+|tests?)\.py|\.(?:test|spec)\.[cm]?[jt]sx?|\.rs))["']?(?=\s|$)/gu;

function namedTestPaths(command: string, root: string): string[] {
  const normalized = String(command ?? "").replaceAll("\\", "/");
  const found: string[] = [];
  for (const match of normalized.matchAll(TEST_FILE_IN_COMMAND)) {
    const captured = match[1] ?? "";
    const relative = relativePath(root, resolve(root, captured.replace(/^\.\//u, "")));
    if (classifyPath(relative).kind === "test") found.push(relative);
  }
  return [...new Set(found)];
}

function selectorTestPaths(command: string, root: string, state: GuardState): string[] {
  const tokens = String(command).match(/[A-Za-z_][A-Za-z0-9_.]*/gu) ?? [];
  const found = new Set<string>();
  const recorded = (state.tests ?? []).map((record) => record.path);
  for (const token of tokens) {
    if (!token.includes(".")) continue;
    const parts = token.split(".");
    for (let length = parts.length; length >= 2; length -= 1) {
      const selector = parts.slice(0, length).join(".");
      const selectorPath = `${selector.replaceAll(".", "/")}.py`;
      const candidates = [selectorPath, `tests/${selectorPath}`, ...recorded.filter((path) => {
        const module = path.replace(/\.py$/u, "").replaceAll("/", ".").replace(/^tests?\./u, "");
        return selector === module || selector.startsWith(`${module}.`);
      })];
      for (const candidate of candidates) {
        if (!existsSync(resolve(root, candidate))) continue;
        if (classifyPath(candidate).kind === "test") found.add(candidate);
      }
    }
  }
  return [...found];
}

function coveredOutcomePaths(command: string, root: string, state: GuardState, outcome: CommandOutcome): string[] {
  const named = [...new Set([...namedTestPaths(command, root), ...selectorTestPaths(command, root, state)])];
  if (named.length > 0) {
    if (outcome === "success" && state.needsGreen?.testPaths?.length) {
      return named.filter((path) => state.needsGreen?.testPaths.includes(path));
    }
    return named;
  }
  if (/\b(?:--list-tests|--collect-only|--listTests)\b/u.test(String(command ?? ""))) return [];
  if (testCommand(command) && state.needsGreen?.testPaths?.length) return state.needsGreen.testPaths;
  return [];
}

function correspondingTests(root: string, source: SourceLike, context: LanguageContext): string[] {
  const found = new Set(findCorrespondingTests(root, source, context));
  if (!hasGitHead(root)) return [...found];
  for (const path of listHeadPaths(root)) {
    const classified = classifyPath(path);
    if (classified.kind !== "test" || classified.language !== source.language) continue;
    const content = gitShowHead(root, path);
    if (content == null) continue;
    const testContext = resolveLanguageContext(root, path, source.language);
    const evidence = extractTestEvidence(source.language, content, path, testContext);
    if (sourceAuthorizedByTest(source, { path, language: source.language, evidence }, context)) {
      found.add(path);
    }
  }
  return [...found];
}

function headCorrespondingTests(root: string, source: SourceLike, state: GuardState, context: LanguageContext, corresponding: string[]): string[] {
  if (hasGitHead(root)) return corresponding.filter((path) => gitPathState(root, path).tracked);
  // No HEAD: keep pre-session disk tests as historical so extra new tests cannot rename the deny.
  return historicalCorrespondingTests(root, source, state, context);
}

function liveObservedRed(state: GuardState, root: string, path: string): boolean {
  const absolutePath = resolve(root, path);
  if (!existsSync(absolutePath)) return false;
  return (state.observedRed ?? {})[path] === hashPath(absolutePath);
}

function remainingCorrespondingTests(root: string, changed: string[], testPaths: string[] | undefined): string[] {
  const existing = (testPaths ?? []).filter((path) => existsSync(resolve(root, path)));
  if (existing.length > 0) return existing;
  const found = new Set<string>();
  for (const path of changed) {
    const classified = classifyPath(path);
    if (classified.kind !== "source" || !classified.language) continue;
    const absolutePath = resolve(root, path);
    const content = existsSync(absolutePath) ? readText(absolutePath) : (gitShowHead(root, path) ?? "");
    const context = resolveLanguageContext(root, path, classified.language);
    for (const testPath of findCorrespondingTests(root, { path, language: classified.language, content }, context)) {
      found.add(testPath);
    }
  }
  return [...found];
}

async function runPre(event: HookEvent): Promise<void> {
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
      const pendingPaths = new Set(state.needsGreen.paths ?? []);
      const allRevert = targets.length > 0 && targets.every((target) => {
        if (pendingPaths.size > 0 && !pendingPaths.has(target.path)) return false;
        const deleting = targetOperation(event, target.absolutePath) === "delete";
        const current = readText(target.absolutePath);
        return restoresHeadState(root, target.path, {
          missing: deleting,
          content: proposedContent(event, target.absolutePath, current),
        });
      });
      if (allRevert) {
        state.pending = {
          kind: "revert",
          toolUseId: toolUseIdOf(event),
          targets: targets.map((target) => ({ path: target.path, beforeHash: hashPath(target.absolutePath) })),
          testPaths: state.needsGreen.testPaths ?? [],
        };
        if (!writeState(sessionId, root, state)) warn("implementation snapshot could not be persisted; GREEN completion will fail closed");
        return;
      }
      writeJson(preToolDeny(`[TDD Guard] Blocked implementation edit: the previous implementation mutation still needs an observed passing test run (GREEN). Run the relevant tests successfully before another implementation change.`));
      return;
    }

    const authorizingTests = new Set<string>();
    for (const target of targets) {
      const current = readText(target.absolutePath);
      const source = { ...target, content: proposedContent(event, target.absolutePath, current) };
      const context = resolveLanguageContext(root, target.path, target.language);
      const corresponding = correspondingTests(root, source, context);
      const headCorresponding = headCorrespondingTests(root, source, state, context, corresponding);
      const redPool = headCorresponding.length > 0 ? headCorresponding : corresponding;
      const redOk = redPool.some((path) => liveObservedRed(state, root, path));
      const headGone = headCorresponding.length > 0 && headCorresponding.every((path) => !existsSync(resolve(root, path)));
      const headDirty = headCorresponding.some((path) => gitPathState(root, path).dirty);
      const isDelete = targetOperation(event, target.absolutePath) === "delete";
      if (redOk) {
        for (const path of redPool) if (liveObservedRed(state, root, path)) authorizingTests.add(path);
        continue;
      }
      if (isDelete && headCorresponding.length > 0 && (headGone || headDirty)) {
        for (const path of headCorresponding) authorizingTests.add(path);
        continue;
      }
      if (headCorresponding.length > 0) {
        writeJson(preToolDeny(`[TDD Guard] Blocked ${target.path}: matching tests already exist (${formatTestPathList(headCorresponding)}), but no current failing test run (RED) was observed after their latest edit. Run the relevant tests, confirm they fail for the intended behavior, then retry the implementation edit.`));
        return;
      }
      const expected = expectedTestExample(target.path, target.language);
      writeJson(preToolDeny(`[TDD Guard] Blocked ${target.path}: no matching edited test with an observed failing run (RED) is available. Create or update ${expected} with a real test case, run it and observe the intended failure, then retry.`));
      return;
    }

    if (!hasGitHead(root)) {
      writeJson(preToolDeny("[TDD Guard] Blocked implementation edit: this workspace has no git HEAD, so implementation writes are denied. Initialize a git repository with a commit, then retry."));
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

async function runPost(event: HookEvent, platform: string, forceFailure = false): Promise<void> {
  const root = cwdOf(event);
  const sessionId = sessionIdOf(event);
  const state = readState(sessionId, root);
  const command = shellCommandOf(event);
  if (command && testCommand(command)) {
    const outcome = inferOutcome(event, forceFailure);
    if (outcome === "failure" && !state.needsGreen) {
      const covered = coveredOutcomePaths(command, root, state, outcome);
      if (covered.length === 0) return;
      state.observedRed = { ...(state.observedRed ?? {}) };
      for (const path of covered) {
        const absolutePath = resolve(root, path);
        if (!existsSync(absolutePath)) continue;
        const hash = hashPath(absolutePath);
        state.observedRed[path] = hash;
        const record = (state.tests ?? []).find((item) => item.path === path);
        if (record) record.redHash = hash;
      }
      state.lastRed = { commandHash: digest(command), testHashes: covered.map((path) => state.observedRed[path]).filter((value): value is string => Boolean(value)) };
    } else if (outcome === "success" && state.needsGreen) {
      const covered = coveredOutcomePaths(command, root, state, outcome);
      if (covered.length === 0) return;
      state.needsGreen = null;
    } else return;
    if (!writeState(sessionId, root, state)) warn("test outcome could not be persisted");
    return;
  }
  if (!state.pending || state.pending.toolUseId !== toolUseIdOf(event)) return;
  if (state.pending.kind === "source" || state.pending.kind === "revert") {
    const testPaths = state.pending.testPaths ?? [];
    const kind = state.pending.kind;
    const pendingTargets = state.pending.targets ?? [];
    const changed = pendingTargets.filter((target) => hashPath(resolve(root, target.path)) !== target.beforeHash).map((target) => target.path);
    state.pending = null;
    if (kind === "revert") {
      const restored = pendingTargets.every((target) => {
        const missing = !existsSync(resolve(root, target.path));
        return restoresHeadState(root, target.path, {
          missing,
          content: missing ? "" : readText(resolve(root, target.path)),
        });
      });
      if (restored) state.needsGreen = null;
    } else if (changed.length > 0) {
      const remaining = remainingCorrespondingTests(root, changed, testPaths);
      const allDeleted = changed.every((path) => !existsSync(resolve(root, path)));
      if (!(allDeleted && remaining.length === 0)) {
        state.needsGreen = { paths: changed, testPaths };
        state.observedRed = {};
        for (const record of state.tests ?? []) delete record.redHash;
      }
    }
    if (!writeState(sessionId, root, state)) warn("implementation outcome could not be persisted; GREEN completion will fail closed");
    return;
  }
  const recorded: string[] = [];
  for (const target of state.pending.targets ?? []) {
    const absolutePath = resolve(root, target.path);
    const afterHash = hashPath(absolutePath);
    state.tests = (state.tests ?? []).filter((record) => record.path !== target.path);
    if (afterHash === "missing" || afterHash === target.beforeHash) continue;
    const language = target.language ?? "";
    const context = resolveLanguageContext(root, target.path, language);
    const evidence = extractTestEvidence(language, readText(absolutePath), target.path, context);
    if (!evidence.valid) continue;
    state.sequence = (state.sequence ?? 0) + 1;
    state.tests.push({
      path: target.path,
      language,
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

async function runStop(event: HookEvent): Promise<void> {
  const root = cwdOf(event);
  const state = readState(sessionIdOf(event), root);
  if (!state.needsGreen) return;
  writeJson(stopDeny(`[TDD Guard] Completion blocked: implementation paths ${state.needsGreen.paths.join(", ")} do not yet have an observed passing test run (GREEN). Run the relevant test command successfully, then retry completion.`));
}

async function main(): Promise<void> {
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
  main().catch((error: unknown) => {
    const mode = process.argv[2];
    warn(`hook validation failed: ${errorMessage(error)}`);
    if (mode === "pre") {
      writeJson(preToolDeny("[TDD Guard] The hook could not validate this write safely, so it was blocked. Fix the hook input or state error, then retry."));
    }
    process.exitCode = 0;
  });
}
