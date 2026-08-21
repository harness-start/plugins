// harness-source-hash: sha256:ef8c1dee4727c17c58b331a0ef81f65f133265434cf7cee4cb0beb1955727e5c
import {
  isRecord
} from "./chunk-F4OSQJXI.mjs";

// plugins/repository-history-migration/src/lib/history-migration.ts
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
function run(command, args, options = {}) {
  try {
    return execFileSync(command, [...args], {
      encoding: "utf8",
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...options.cwd !== void 0 ? { cwd: options.cwd } : {}
    }).trim();
  } catch (error) {
    const stderr = isRecord(error) && typeof error.stderr === "string" ? error.stderr.trim() : "";
    const stdout = isRecord(error) && typeof error.stdout === "string" ? error.stdout.trim() : "";
    const detail = stderr || stdout || (error instanceof Error ? error.message : String(error));
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`, { cause: error });
  }
}
function git(cwd, ...args) {
  return run("git", ["-C", cwd, ...args]);
}
function assertText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}
function validateIncludePath(input) {
  const value = assertText(input, "include path");
  const parts = value.split("/");
  if (isAbsolute(value) || value.includes("\\") || parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`include path must be a safe repository-relative path: ${value}`);
  }
  return value;
}
function normalizeInputs(options) {
  const sourceInput = assertText(options.source, "source");
  const targetInput = assertText(options.target, "target");
  const ref = options.ref === void 0 ? "HEAD" : assertText(options.ref, "ref");
  const targetBranch = options.targetBranch === void 0 ? "main" : assertText(options.targetBranch, "targetBranch");
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
  if (target === source || !targetFromSource.startsWith(`..${sep}`) && targetFromSource !== ".." && !isAbsolute(targetFromSource)) {
    throw new Error("target path must not be inside the source repository");
  }
  if (existsSync(target)) {
    throw new Error(`target path must be absent: ${target}`);
  }
  accessSync(parent, constants.R_OK | constants.W_OK | constants.X_OK);
  git(source, "check-ref-format", `refs/heads/${targetBranch}`);
  return { source, target, parent, ref, targetBranch, includePaths };
}
function planDigest(plan) {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}
function assertSourceClean(source) {
  const status = git(source, "status", "--porcelain=v1", "--untracked-files=all");
  if (status !== "") {
    throw new Error("source repository is dirty; commit, stash, or remove source changes before migration");
  }
}
function assertFilterRepo(executable) {
  return run(executable, ["--version"]);
}
function preflightMigration(options) {
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
    ...input.includePaths
  ));
  const plan = {
    source: input.source,
    target: input.target,
    ref: input.ref,
    targetBranch: input.targetBranch,
    includePaths: input.includePaths,
    sourceHead,
    filterRepoVersion
  };
  return {
    ok: true,
    ...plan,
    commitCount,
    planDigest: planDigest(plan)
  };
}
function removeTags(repository) {
  const tags = git(repository, "tag", "--list").split("\n").filter(Boolean);
  if (tags.length > 0) git(repository, "tag", "--delete", ...tags);
}
function removeOtherLocalBranches(repository, targetBranch) {
  const targetRef = `refs/heads/${targetBranch}`;
  const refs = git(
    repository,
    "for-each-ref",
    "--format=%(refname)",
    "refs/heads"
  ).split("\n").filter(Boolean);
  for (const ref of refs) {
    if (ref !== targetRef) git(repository, "update-ref", "-d", ref);
  }
}
function executeMigration(options) {
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
      ...preflight.includePaths.flatMap((path) => ["--path", path])
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
      planDigest: preflight.planDigest
    };
  } finally {
    if (!published && existsSync(temporary)) {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
}

// plugins/repository-history-migration/src/lib/cli.ts
function requireProvenance() {
  const sessionId = process.env.AI_EXPERTS_SESSION_ID?.trim();
  const triggerFrom = process.env.AI_EXPERTS_TRIGGER_FROM?.trim();
  if (!sessionId || !triggerFrom) {
    throw new Error("AI_EXPERTS_SESSION_ID and AI_EXPERTS_TRIGGER_FROM are required");
  }
  return { sessionId, triggerFrom };
}
function parseArguments(argv, { execute = false } = {}) {
  const result = { includePaths: [] };
  const scalar = /* @__PURE__ */ new Map([
    ["--source", "source"],
    ["--target", "target"],
    ["--ref", "ref"],
    ["--target-branch", "targetBranch"],
    ["--git-filter-repo", "gitFilterRepo"],
    ["--expected-source-head", "expectedSourceHead"],
    ["--expected-plan-digest", "expectedPlanDigest"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--include") {
      if (!value) throw new Error("--include requires a value");
      result.includePaths.push(value);
      index += 1;
    } else if (flag !== void 0 && scalar.has(flag)) {
      if (!value) throw new Error(`${flag} requires a value`);
      const field = scalar.get(flag);
      if (field) result[field] = value;
      index += 1;
    } else {
      throw new Error(`unknown argument: ${flag}`);
    }
  }
  const source = result.source;
  const target = result.target;
  if (!source) throw new Error("--source is required");
  if (!target) throw new Error("--target is required");
  if (result.includePaths.length === 0) throw new Error("at least one --include is required");
  if (execute) {
    if (!result.expectedSourceHead) throw new Error("--expected-source-head is required");
    if (!result.expectedPlanDigest) throw new Error("--expected-plan-digest is required");
  }
  return { ...result, source, target };
}
function runCli(toolId, operation, argv) {
  try {
    const provenance = requireProvenance();
    const data = operation(parseArguments(argv, { execute: toolId.endsWith("execute") }));
    process.stdout.write(`${JSON.stringify({
      ok: true,
      toolId,
      ...provenance,
      observedAt: (/* @__PURE__ */ new Date()).toISOString(),
      data
    })}
`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      toolId,
      sessionId: process.env.AI_EXPERTS_SESSION_ID ?? null,
      triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM ?? null,
      observedAt: (/* @__PURE__ */ new Date()).toISOString(),
      error: error instanceof Error ? error.message : String(error)
    })}
`);
    process.exitCode = 1;
  }
}

export {
  preflightMigration,
  executeMigration,
  runCli
};
