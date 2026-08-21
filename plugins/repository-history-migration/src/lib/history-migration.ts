import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { isRecord } from "@harness/core/hook-event";

export type MigrationOptions = {
  source: string;
  target: string;
  includePaths: readonly string[];
  ref?: string;
  targetBranch?: string;
  gitFilterRepo?: string;
  expectedSourceHead?: string;
  expectedPlanDigest?: string;
};

type NormalizedInputs = {
  source: string;
  target: string;
  parent: string;
  ref: string;
  targetBranch: string;
  includePaths: string[];
};

type MigrationPlan = {
  source: string;
  target: string;
  ref: string;
  targetBranch: string;
  includePaths: string[];
  sourceHead: string;
  filterRepoVersion: string;
};

export type PreflightResult = MigrationPlan & {
  ok: true;
  commitCount: number;
  planDigest: string;
};

export type ExecuteResult = {
  ok: true;
  source: string;
  sourceHead: string;
  target: string;
  targetHead: string;
  targetBranch: string;
  includePaths: string[];
  commitCount: number;
  planDigest: string;
};

type RunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

function run(command: string, args: readonly string[], options: RunOptions = {}): string {
  try {
    return execFileSync(command, [...args], {
      encoding: "utf8",
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    }).trim();
  } catch (error: unknown) {
    const stderr = isRecord(error) && typeof error.stderr === "string" ? error.stderr.trim() : "";
    const stdout = isRecord(error) && typeof error.stdout === "string" ? error.stdout.trim() : "";
    const detail = stderr || stdout || (error instanceof Error ? error.message : String(error));
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`, { cause: error });
  }
}

function git(cwd: string, ...args: string[]): string {
  return run("git", ["-C", cwd, ...args]);
}

function assertText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function validateIncludePath(input: unknown): string {
  const value = assertText(input, "include path");
  const parts = value.split("/");
  if (
    isAbsolute(value)
    || value.includes("\\")
    || parts.some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`include path must be a safe repository-relative path: ${value}`);
  }
  return value;
}

function normalizeInputs(options: MigrationOptions): NormalizedInputs {
  const sourceInput = assertText(options.source, "source");
  const targetInput = assertText(options.target, "target");
  const ref = options.ref === undefined ? "HEAD" : assertText(options.ref, "ref");
  const targetBranch = options.targetBranch === undefined
    ? "main"
    : assertText(options.targetBranch, "targetBranch");
  if (!Array.isArray(options.includePaths) || options.includePaths.length === 0) {
    throw new TypeError("includePaths must contain at least one path");
  }

  const requestedSource = realpathSync(resolve(sourceInput));
  git(requestedSource, "rev-parse", "--is-inside-work-tree");
  const source = realpathSync(git(requestedSource, "rev-parse", "--show-toplevel"));
  const requestedTarget = resolve(targetInput);
  const requestedParent = dirname(requestedTarget);
  if (!existsSync(requestedParent)) {
    throw new Error(`target parent must exist: ${requestedParent}`);
  }
  const parent = realpathSync(requestedParent);
  const target = resolve(parent, basename(requestedTarget));
  const includePaths = [...new Set(options.includePaths.map(validateIncludePath))].sort();
  const targetFromSource = relative(source, target);

  if (target === source || (!targetFromSource.startsWith(`..${sep}`) && targetFromSource !== ".." && !isAbsolute(targetFromSource))) {
    throw new Error("target path must not be inside the source repository");
  }
  if (existsSync(target)) {
    throw new Error(`target path must be absent: ${target}`);
  }
  accessSync(parent, constants.R_OK | constants.W_OK | constants.X_OK);

  git(source, "check-ref-format", `refs/heads/${targetBranch}`);
  return { source, target, parent, ref, targetBranch, includePaths };
}

function planDigest(plan: MigrationPlan): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

function assertSourceClean(source: string): void {
  const status = git(source, "status", "--porcelain=v1", "--untracked-files=all");
  if (status !== "") {
    throw new Error("source repository is dirty; commit, stash, or remove source changes before migration");
  }
}

function assertFilterRepo(executable: string): string {
  return run(executable, ["--version"]);
}

export function preflightMigration(options: MigrationOptions): PreflightResult {
  const input = normalizeInputs(options);
  const filterRepo = options.gitFilterRepo ?? "git-filter-repo";
  assertSourceClean(input.source);
  const filterRepoVersion = assertFilterRepo(filterRepo);

  const sourceHead = git(input.source, "rev-parse", `${input.ref}^{commit}`);
  for (const path of input.includePaths) {
    try {
      git(input.source, "cat-file", "-e", `${sourceHead}:${path}`);
    } catch {
      throw new Error(`include path does not exist at ${sourceHead}: ${path}`);
    }
  }
  const commitCount = Number(git(
    input.source,
    "rev-list",
    "--count",
    sourceHead,
    "--",
    ...input.includePaths,
  ));
  const plan: MigrationPlan = {
    source: input.source,
    target: input.target,
    ref: input.ref,
    targetBranch: input.targetBranch,
    includePaths: input.includePaths,
    sourceHead,
    filterRepoVersion,
  };

  return {
    ok: true,
    ...plan,
    commitCount,
    planDigest: planDigest(plan),
  };
}

function removeTags(repository: string): void {
  const tags = git(repository, "tag", "--list").split("\n").filter(Boolean);
  if (tags.length > 0) git(repository, "tag", "--delete", ...tags);
}

function removeOtherLocalBranches(repository: string, targetBranch: string): void {
  const targetRef = `refs/heads/${targetBranch}`;
  const refs = git(
    repository,
    "for-each-ref",
    "--format=%(refname)",
    "refs/heads",
  ).split("\n").filter(Boolean);
  for (const ref of refs) {
    if (ref !== targetRef) git(repository, "update-ref", "-d", ref);
  }
}

export function executeMigration(options: MigrationOptions): ExecuteResult {
  const expectedSourceHead = assertText(options.expectedSourceHead, "expectedSourceHead");
  const expectedPlanDigest = assertText(options.expectedPlanDigest, "expectedPlanDigest");
  const filterRepo = options.gitFilterRepo ?? "git-filter-repo";
  const preflight = preflightMigration(options);

  if (preflight.sourceHead !== expectedSourceHead) {
    throw new Error(`source HEAD changed: expected ${expectedSourceHead}, observed ${preflight.sourceHead}`);
  }
  if (preflight.planDigest !== expectedPlanDigest) {
    throw new Error(`plan digest changed: expected ${expectedPlanDigest}, observed ${preflight.planDigest}`);
  }

  const temporary = mkdtempSync(resolve(dirname(preflight.target), ".history-migration-"));
  let published = false;
  try {
    run("git", ["clone", "--no-local", "--no-checkout", preflight.source, temporary]);
    git(temporary, "checkout", "-B", preflight.targetBranch, preflight.sourceHead);
    git(temporary, "remote", "remove", "origin");
    removeOtherLocalBranches(temporary, preflight.targetBranch);
    removeTags(temporary);
    run(filterRepo, [
      "--force",
      ...preflight.includePaths.flatMap((path) => ["--path", path]),
    ], { cwd: temporary });

    const targetHead = git(temporary, "rev-parse", "HEAD");
    const commitCount = Number(git(temporary, "rev-list", "--count", "HEAD"));
    if (!Number.isInteger(commitCount) || commitCount < 1) {
      throw new Error("filtered target has no commits");
    }
    if (git(temporary, "status", "--porcelain=v1") !== "") {
      throw new Error("filtered target is dirty before publication");
    }

    renameSync(temporary, preflight.target);
    published = true;
    return {
      ok: true,
      source: preflight.source,
      sourceHead: preflight.sourceHead,
      target: preflight.target,
      targetHead,
      targetBranch: preflight.targetBranch,
      includePaths: preflight.includePaths,
      commitCount,
      planDigest: preflight.planDigest,
    };
  } finally {
    if (!published && existsSync(temporary)) {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
}
