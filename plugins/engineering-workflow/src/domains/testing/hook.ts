#!/usr/bin/env node

import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { HookOutput, OwnerHookHandlerContext } from "@harness/core/aio-dispatcher";
import type { HookEvent } from "@harness/core/hook-event";
import { isRecord } from "@harness/core/hook-event";

import {
  additionalContext,
  cwdOf,
  extractTargets,
  opaqueShellMutation,
  preToolDeny,
  proposedContent,
  relativePath,
  shellCommandOf,
  targetOperation,
} from "./lib/hook-io.js";
import { findCorrespondingTests, formatTestPathList } from "./lib/existing-tests.js";
import {
  gitPathState,
  gitShowHead,
  hasGitHead,
  listDirtyPaths,
  listHeadPaths,
  restoresHeadState,
} from "./lib/git-workspace.js";
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
} from "./lib/patterns.js";

const outputStore = new AsyncLocalStorage<HookOutput[]>();

function writeJson(output: Record<string, unknown> | null): void {
  if (!output) return;
  const outputs = outputStore.getStore();
  if (!outputs) throw new Error("testing output was emitted outside the owner dispatcher");
  outputs.push(output as HookOutput);
}

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
  return "[TDD Guard] A single tool call cannot mix test and implementation files. Use separate tool calls: change the test first, then change the implementation.";
}

function headCorrespondingTests(root: string, source: SourceLike, context: LanguageContext): string[] {
  if (!hasGitHead(root)) return [];
  const found = new Set<string>();
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

function dirtyLiveTests(root: string, source: SourceLike, context: LanguageContext): string[] {
  return findCorrespondingTests(root, source, context).filter((path) => {
    const state = gitPathState(root, path);
    return state.present && state.dirty;
  });
}

function restoresBaseline(root: string, event: HookEvent, target: ActiveTarget): boolean {
  const deleting = targetOperation(event, target.absolutePath) === "delete";
  if (!deleting && shellCommandOf(event)) return false;
  const current = readText(target.absolutePath);
  return restoresHeadState(root, target.path, {
    missing: deleting,
    content: deleting ? "" : proposedContent(event, target.absolutePath, current),
  });
}

function dirtySourceTargets(root: string): ActiveTarget[] {
  return listDirtyPaths(root).map((path) => {
    const absolutePath = resolve(root, path);
    return { absolutePath, path, ...classifyPath(path) };
  }).filter((target): target is ActiveTarget => isActiveTarget(target) && target.kind === "source" && gitPathState(root, target.path).present);
}

function testRecord(root: string, event: HookEvent, target: ActiveTarget, proposed: boolean) {
  const deleting = proposed && targetOperation(event, target.absolutePath) === "delete";
  if (deleting) return null;
  const content = proposed
    ? proposedContent(event, target.absolutePath, readText(target.absolutePath))
    : readText(target.absolutePath);
  const context = resolveLanguageContext(root, target.path, target.language);
  return {
    path: target.path,
    language: target.language,
    evidence: extractTestEvidence(target.language, content, target.path, context),
    dirty: gitShowHead(root, target.path) !== content,
  };
}

function testChangeBreaksAuthorization(root: string, event: HookEvent, target: ActiveTarget, eventTargets: ActiveTarget[]): string | null {
  const current = testRecord(root, event, target, false);
  if (!current?.dirty) return null;
  const proposed = testRecord(root, event, target, true);
  for (const dirtySource of dirtySourceTargets(root)) {
    if (dirtySource.language !== target.language) continue;
    const source = sourceForTarget(root, event, dirtySource, false);
    const context = resolveLanguageContext(root, dirtySource.path, dirtySource.language);
    if (!sourceAuthorizedByTest(source, current, context)) continue;
    if (proposed?.dirty && sourceAuthorizedByTest(source, proposed, context)) continue;
    const candidates = new Set([
      ...dirtyLiveTests(root, source, context),
      ...eventTargets.filter((candidate) => candidate.kind === "test" && candidate.language === target.language).map((candidate) => candidate.path),
    ]);
    candidates.delete(target.path);
    const hasAlternative = [...candidates].some((path) => {
      const changedTarget = eventTargets.find((candidate) => candidate.kind === "test" && candidate.path === path);
      const record = changedTarget ? testRecord(root, event, changedTarget, true) : testRecord(root, event, {
        absolutePath: resolve(root, path),
        path,
        kind: "test",
        language: target.language,
      }, false);
      return record?.dirty === true && sourceAuthorizedByTest(source, record, context);
    });
    if (!hasAlternative) return dirtySource.path;
  }
  return null;
}

function sourceForTarget(root: string, event: HookEvent, target: ActiveTarget, deleting: boolean): SourceLike {
  const current = readText(target.absolutePath);
  return {
    path: target.path,
    language: target.language,
    content: deleting ? (current || gitShowHead(root, target.path) || "") : proposedContent(event, target.absolutePath, current),
  };
}

function denySourceChange(target: ActiveTarget, tests: string[]): void {
  if (tests.length > 0) {
    writeJson(preToolDeny(`[TDD Guard] Blocked ${target.path}: matching tests exist (${formatTestPathList(tests)}), but none has changed relative to git HEAD. Change a corresponding test first, then retry the implementation change.`));
    return;
  }
  writeJson(preToolDeny(`[TDD Guard] Blocked ${target.path}: no changed corresponding test exists. Create or update ${expectedTestExample(target.path, target.language)} with a real test case first, then retry the implementation change.`));
}

function checkSourceTarget(root: string, event: HookEvent, target: ActiveTarget): boolean {
  if (restoresBaseline(root, event, target)) return true;
  const deleting = targetOperation(event, target.absolutePath) === "delete";
  const source = sourceForTarget(root, event, target, deleting);
  const context = resolveLanguageContext(root, target.path, target.language);

  if (deleting) {
    const historical = headCorrespondingTests(root, source, context);
    if (historical.length > 0 && historical.every((path) => gitPathState(root, path).dirty)) return true;
    denySourceChange(target, historical);
    return false;
  }

  const current = findCorrespondingTests(root, source, context);
  if (dirtyLiveTests(root, source, context).length > 0) return true;
  denySourceChange(target, current);
  return false;
}

function testFirstFileOrderContext(): string {
  return [
    "[TDD Guard] Test-first file order is enforced against git HEAD.",
    "Change a corresponding test in a separate tool call before changing implementation.",
    "A single patch or tool call cannot mix test and source files. A dirty test may cover later implementation edits.",
    "This hook does not run tests and does not prove RED/GREEN. Optional method: load `tdd-red-green` for the red-green-refactor loop. Skill load is not a hook prerequisite.",
  ].join("\n");
}

function runSessionStart(): void {
  writeJson(additionalContext("SessionStart", testFirstFileOrderContext()));
}

async function runPre(event: HookEvent): Promise<void> {
  const root = cwdOf(event);
  const targets = targetsFor(event, root);
  if (targets.length === 0) {
    const opaqueMutation = opaqueShellMutation(event);
    if (opaqueMutation) {
      writeJson(preToolDeny(`[TDD Guard] Blocked opaque implementation mutation: ${opaqueMutation}. Use file tools or an explicit patch whose target paths can be checked against corresponding tests.`));
    }
    return;
  }
  const kinds = new Set(targets.map((target) => target.kind));
  if (kinds.has("test") && kinds.has("source")) {
    writeJson(preToolDeny(mixedWriteFinding()));
    return;
  }
  if (!kinds.has("source")) {
    for (const target of targets) {
      if (target.kind !== "test") continue;
      const affectedSource = testChangeBreaksAuthorization(root, event, target, targets);
      if (affectedSource) {
        writeJson(preToolDeny(`[TDD Guard] Blocked ${target.path}: deleting or weakening this test would leave dirty implementation ${affectedSource} without a changed corresponding test. Restore the implementation first or keep another changed corresponding test.`));
        return;
      }
    }
    return;
  }
  if (!hasGitHead(root)) {
    writeJson(preToolDeny("[TDD Guard] Blocked implementation change: this workspace has no git HEAD. Initialize a git repository with a commit, then change a corresponding test before retrying."));
    return;
  }
  for (const target of targets) {
    if (target.kind === "source" && !checkSourceTarget(root, event, target)) return;
  }
}

export async function handleTesting(
  { args, event }: OwnerHookHandlerContext,
): Promise<HookOutput[]> {
  const mode = args[0];
  const outputs: HookOutput[] = [];
  return outputStore.run(outputs, async () => {
    if (event.__parseError) {
      warn("hook input was not valid JSON");
      if (mode === "pre") {
        writeJson(preToolDeny("[TDD Guard] The hook could not parse this implementation event safely, so it was blocked. Fix the hook input, then retry."));
      } else if (mode === "session-start") {
        warn("advisory context was skipped");
      }
      return outputs;
    }
    if (mode === "pre") await runPre(event);
    else if (mode === "session-start") runSessionStart();
    return outputs;
  }).catch((error: unknown) => {
    warn(`hook validation failed: ${errorMessage(error)}`);
    if (mode === "pre") {
      const output = preToolDeny("[TDD Guard] The hook could not validate this implementation change safely, so it was blocked. Fix the hook input or git state, then retry.");
      return output ? [output as HookOutput] : [];
    }
    return [];
  });
}
