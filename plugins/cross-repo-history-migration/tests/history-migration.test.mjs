import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, test } from "node:test";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  executeMigration,
  preflightMigration,
  validateIncludePath,
} from "../scripts/lib/history-migration.mjs";

const tempRoots = [];
const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function makeHermeticFilterRepo(root) {
  const executable = join(root, "git-filter-repo-fixture");
  writeFileSync(executable, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "if [ \"${1:-}\" = \"--version\" ]; then",
    "  printf 'fixture-filter-repo-v1\\n'",
    "  exit 0",
    "fi",
    "keep_file=\"$(git rev-parse --absolute-git-dir)/fixture-filter-repo-keep\"",
    "trap 'rm -f \"$keep_file\"' EXIT",
    ": > \"$keep_file\"",
    "while [ \"$#\" -gt 0 ]; do",
    "  case \"$1\" in",
    "    --force) shift ;;",
    "    --path)",
    "      printf '%s\\n' \"$2\" >> \"$keep_file\"",
    "      shift 2",
    "      ;;",
    "    *)",
    "      printf 'unsupported fixture argument: %s\\n' \"$1\" >&2",
    "      exit 64",
    "      ;;",
    "  esac",
    "done",
    "export FIXTURE_FILTER_KEEP_FILE=\"$keep_file\"",
    "FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force --prune-empty --index-filter '",
    "  git ls-files | while IFS= read -r candidate; do",
    "    keep=0",
    "    while IFS= read -r selected; do",
    "      case \"$candidate\" in",
    "        \"$selected\"|\"$selected\"/*) keep=1; break ;;",
    "      esac",
    "    done < \"$FIXTURE_FILTER_KEEP_FILE\"",
    "    if [ \"$keep\" -eq 0 ]; then",
    "      git rm --cached -q --ignore-unmatch -- \"$candidate\"",
    "    fi",
    "  done",
    "' -- --all",
    "git for-each-ref --format='%(refname)' refs/original | while IFS= read -r ref; do",
    "  [ -z \"$ref\" ] || git update-ref -d \"$ref\"",
    "done",
    "",
  ].join("\n"));
  chmodSync(executable, 0o755);
  return executable;
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "history-migration-test-"));
  tempRoots.push(root);
  const source = join(root, "source");
  const target = join(root, "target");

  execFileSync("git", ["init", "--initial-branch=main", source]);
  git(source, "config", "user.email", "tests@example.invalid");
  git(source, "config", "user.name", "Migration Test");
  execFileSync("mkdir", ["-p", join(source, "packages", "widget")]);
  writeFileSync(join(source, "packages", "widget", "data.txt"), "one\n");
  writeFileSync(join(source, "unrelated.txt"), "outside\n");
  git(source, "add", "packages/widget/data.txt", "unrelated.txt");
  git(source, "commit", "-m", "initial fixture");
  writeFileSync(join(source, "packages", "widget", "data.txt"), "one\ntwo\n");
  git(source, "add", "packages/widget/data.txt");
  git(source, "commit", "-m", "update widget");

  return { root, source, target, gitFilterRepo: makeHermeticFilterRepo(root) };
}

test("include paths reject absolute paths, traversal, backslashes, and dot segments", () => {
  for (const path of ["/etc/passwd", "../secret", "a/../../secret", "a\\b", ".", "./a"] ) {
    assert.throws(() => validateIncludePath(path), /safe repository-relative path/iu, path);
  }
  assert.equal(validateIncludePath("packages/widget"), "packages/widget");
});

test("preflight seals source head and plan digest without changing the source", () => {
  const { source, target, gitFilterRepo } = fixture();
  const beforeHead = git(source, "rev-parse", "HEAD");
  const beforeStatus = git(source, "status", "--porcelain=v1");

  const result = preflightMigration({
    source,
    target,
    ref: "main",
    includePaths: ["packages/widget"],
    gitFilterRepo,
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceHead, beforeHead);
  assert.match(result.planDigest, /^[a-f0-9]{64}$/u);
  assert.deepEqual(result.includePaths, ["packages/widget"]);
  assert.equal(result.commitCount, 2);
  assert.equal(git(source, "rev-parse", "HEAD"), beforeHead);
  assert.equal(git(source, "status", "--porcelain=v1"), beforeStatus);
});

test("preflight binds the observed filter implementation version into the seal", () => {
  const { root, source, target } = fixture();
  const filterRepo = join(root, "git-filter-repo-fixture");
  writeFileSync(filterRepo, "#!/usr/bin/env bash\nprintf 'fixture-version-1\\n'\n");
  chmodSync(filterRepo, 0o755);

  const result = preflightMigration({
    source,
    target,
    includePaths: ["packages/widget"],
    gitFilterRepo: filterRepo,
  });

  assert.equal(result.filterRepoVersion, "fixture-version-1");
  assert.match(result.planDigest, /^[a-f0-9]{64}$/u);
});

test("preflight refuses a dirty source and an existing target", () => {
  const { source, target } = fixture();
  writeFileSync(join(source, "untracked.txt"), "dirty\n");
  assert.throws(
    () => preflightMigration({ source, target, includePaths: ["packages/widget"] }),
    /source repository is dirty/iu,
  );

  execFileSync("mkdir", [target]);
  assert.throws(
    () => preflightMigration({ source, target, includePaths: ["packages/widget"] }),
    /target path must be absent/iu,
  );
});

test("preflight resolves a symlinked target parent before enforcing source isolation", () => {
  const { root, source } = fixture();
  execFileSync("mkdir", [join(source, "published")]);
  writeFileSync(join(source, "published", ".keep"), "tracked\n");
  git(source, "add", "published/.keep");
  git(source, "commit", "-m", "add target trap");
  const linkedParent = join(root, "linked-parent");
  symlinkSync(join(source, "published"), linkedParent, "dir");

  assert.throws(
    () => preflightMigration({
      source,
      target: join(linkedParent, "target"),
      includePaths: ["packages/widget"],
    }),
    /target path must not be inside the source repository/iu,
  );
});

test("execute preserves selected history, excludes unrelated content, and leaves source unchanged", () => {
  const { source, target, gitFilterRepo } = fixture();
  const sourceHead = git(source, "rev-parse", "HEAD");
  const sourceRefs = git(source, "show-ref");
  const seal = preflightMigration({
    source,
    target,
    ref: "main",
    includePaths: ["packages/widget"],
    gitFilterRepo,
  });

  const result = executeMigration({
    source,
    target,
    ref: "main",
    includePaths: ["packages/widget"],
    gitFilterRepo,
    expectedSourceHead: seal.sourceHead,
    expectedPlanDigest: seal.planDigest,
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceHead, sourceHead);
  assert.equal(result.targetHead, git(target, "rev-parse", "HEAD"));
  assert.equal(result.commitCount, 2);
  assert.equal(readFileSync(join(target, "packages", "widget", "data.txt"), "utf8"), "one\ntwo\n");
  assert.throws(() => readFileSync(join(target, "unrelated.txt"), "utf8"), /ENOENT/u);
  assert.equal(git(target, "branch", "--show-current"), "main");
  assert.equal(git(target, "remote"), "");
  assert.equal(git(source, "rev-parse", "HEAD"), sourceHead);
  assert.equal(git(source, "show-ref"), sourceRefs);
  assert.equal(git(source, "status", "--porcelain=v1"), "");
});

test("execute publishes only the requested target branch", () => {
  const { source, target, gitFilterRepo } = fixture();
  const seal = preflightMigration({
    source,
    target,
    targetBranch: "trunk",
    includePaths: ["packages/widget"],
    gitFilterRepo,
  });

  executeMigration({
    source,
    target,
    targetBranch: "trunk",
    includePaths: ["packages/widget"],
    gitFilterRepo,
    expectedSourceHead: seal.sourceHead,
    expectedPlanDigest: seal.planDigest,
  });

  assert.equal(git(target, "branch", "--show-current"), "trunk");
  assert.equal(
    git(target, "for-each-ref", "--format=%(refname:short)", "refs/heads"),
    "trunk",
  );
});

test("execute rejects a stale source seal before creating the target", () => {
  const { source, target, gitFilterRepo } = fixture();
  const seal = preflightMigration({
    source,
    target,
    ref: "main",
    includePaths: ["packages/widget"],
    gitFilterRepo,
  });
  writeFileSync(join(source, "packages", "widget", "data.txt"), "one\ntwo\nthree\n");
  git(source, "add", "packages/widget/data.txt");
  git(source, "commit", "-m", "move source head");

  assert.throws(
    () => executeMigration({
      source,
      target,
      ref: "main",
      includePaths: ["packages/widget"],
      gitFilterRepo,
      expectedSourceHead: seal.sourceHead,
      expectedPlanDigest: seal.planDigest,
    }),
    /source HEAD changed/iu,
  );
  assert.throws(() => git(target, "rev-parse", "HEAD"));
});

test("execute rejects a mismatched plan digest before creating the target", () => {
  const { source, target, gitFilterRepo } = fixture();
  const seal = preflightMigration({
    source,
    target,
    includePaths: ["packages/widget"],
    gitFilterRepo,
  });

  assert.throws(
    () => executeMigration({
      source,
      target,
      includePaths: ["packages/widget"],
      gitFilterRepo,
      expectedSourceHead: seal.sourceHead,
      expectedPlanDigest: "0".repeat(64),
    }),
    /plan digest changed/iu,
  );
  assert.throws(() => git(target, "rev-parse", "HEAD"));
});

test("failed filtering cleans its unique temporary clone and leaves target absent", () => {
  const { root, source, target } = fixture();
  const filterRepo = join(root, "git-filter-repo-failing");
  writeFileSync(filterRepo, [
    "#!/usr/bin/env bash",
    "if [ \"${1:-}\" = \"--version\" ]; then",
    "  printf 'fixture-version-1\\n'",
    "  exit 0",
    "fi",
    "exit 42",
    "",
  ].join("\n"));
  chmodSync(filterRepo, 0o755);
  const seal = preflightMigration({
    source,
    target,
    includePaths: ["packages/widget"],
    gitFilterRepo: filterRepo,
  });

  assert.throws(
    () => executeMigration({
      source,
      target,
      includePaths: ["packages/widget"],
      gitFilterRepo: filterRepo,
      expectedSourceHead: seal.sourceHead,
      expectedPlanDigest: seal.planDigest,
    }),
    /git-filter-repo-failing.*failed/iu,
  );
  assert.equal(readdirSync(root).some((name) => name.startsWith(".history-migration-")), false);
  assert.throws(() => git(target, "rev-parse", "HEAD"));
});

test("CLI refuses missing provenance and emits a bound JSON receipt when provided", () => {
  const { source, target, gitFilterRepo } = fixture();
  const script = join(PLUGIN_ROOT, "scripts", "git-history-migration-preflight.mjs");
  const args = [
    script,
    "--source", source,
    "--target", target,
    "--include", "packages/widget",
    "--git-filter-repo", gitFilterRepo,
  ];
  const withoutProvenance = { ...process.env };
  delete withoutProvenance.AI_EXPERTS_SESSION_ID;
  delete withoutProvenance.AI_EXPERTS_TRIGGER_FROM;
  const refused = spawnSync(process.execPath, args, { encoding: "utf8", env: withoutProvenance });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /AI_EXPERTS_SESSION_ID.*AI_EXPERTS_TRIGGER_FROM/u);

  const accepted = spawnSync(process.execPath, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      AI_EXPERTS_SESSION_ID: "test-session",
      AI_EXPERTS_TRIGGER_FROM: "test-suite",
    },
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  const receipt = JSON.parse(accepted.stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.toolId, "git-history-migration-preflight");
  assert.equal(receipt.sessionId, "test-session");
  assert.equal(receipt.triggerFrom, "test-suite");
  assert.equal(receipt.data.sourceHead, git(source, "rev-parse", "HEAD"));
  assert.match(receipt.data.planDigest, /^[a-f0-9]{64}$/u);
});
