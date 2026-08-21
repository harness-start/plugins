#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { HookEvent } from "@harness/core/hook-event";
import { isRecord } from "@harness/core/hook-event";

import {
  additionalContext,
  cwdOf,
  extractTargets,
  preToolDeny,
  proposedContent,
  readStdinJson,
  relativePath,
  targetOperation,
  writeJson,
} from "../../lib/hook-io.js";
import { findCorrespondingTests, formatTestPathList } from "../../lib/existing-tests.js";
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
  const current = readText(target.absolutePath);
  return restoresHeadState(root, target.path, {
    missing: deleting,
    content: deleting ? "" : proposedContent(event, target.absolutePath, current),
  });
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
  if (targets.length === 0) return;
  const kinds = new Set(targets.map((target) => target.kind));
  if (kinds.has("test") && kinds.has("source")) {
    writeJson(preToolDeny(mixedWriteFinding()));
    return;
  }
  if (!kinds.has("source")) return;
  if (!hasGitHead(root)) {
    writeJson(preToolDeny("[TDD Guard] Blocked implementation change: this workspace has no git HEAD. Initialize a git repository with a commit, then change a corresponding test before retrying."));
    return;
  }
  for (const target of targets) {
    if (target.kind === "source" && !checkSourceTarget(root, event, target)) return;
  }
}

async function main(): Promise<void> {
  const event = await readStdinJson();
  const mode = process.argv[2];
  if (event.__parseError) {
    warn("hook input was not valid JSON");
    if (mode === "pre") {
      writeJson(preToolDeny("[TDD Guard] The hook could not parse this implementation event safely, so it was blocked. Fix the hook input, then retry."));
    } else if (mode === "session-start") {
      warn("advisory context was skipped");
    }
    return;
  }
  if (mode === "pre") await runPre(event);
  else if (mode === "session-start") runSessionStart();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    const mode = process.argv[2];
    warn(`hook validation failed: ${errorMessage(error)}`);
    if (mode === "pre") {
      writeJson(preToolDeny("[TDD Guard] The hook could not validate this implementation change safely, so it was blocked. Fix the hook input or git state, then retry."));
    }
    process.exitCode = 0;
  });
}
