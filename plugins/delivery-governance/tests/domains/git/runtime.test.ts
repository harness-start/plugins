import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyDeliveryCommand, gitInvocations,
} from "../../../src/domains/git/checks/command-rules.js";
import {
  findMergeConflictMarkers, modeForConflict, resolveConflictConfig,
} from "../../../src/domains/git/checks/file-checks.js";
import { deliveryStateFindings } from "../../../src/domains/git/checks/state-checks.js";
import {
  isWorktreeCreatePermitted, readWorktreeCreateReceipt, recordWorktreeCreateAllowance,
  userRequestedWorktreeCreate, worktreeCreateReceiptPath, worktreeIsolationRequested,
} from "../../../src/domains/git/lib/worktree-intent.js";

const DISPATCHER = fileURLToPath(new URL("../../../dist/hooks/dispatcher.mjs", import.meta.url));
const PRE = { path: DISPATCHER, eventName: "PreToolUse" };
const POST = { path: DISPATCHER, eventName: "PostToolUse" };
const PROMPT = { path: DISPATCHER, eventName: "UserPromptSubmit" };

function runEntry(entry, event) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [entry.path, "codex", entry.eventName], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

function createRepository(prefix = "git-delivery-") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  return root;
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

test("command classifier enforces the Git-only strict command rules", () => {
  const denied = [
    ["git add .", /Git Add/u],
    ["git add :/", /Git Add/u],
    ["git add ':(glob)**'", /Git Add/u],
    ["git add -A", /Git Add/u],
    ["git reset --hard", /Dangerous Git/u],
    ["git clean -fd", /Dangerous Git/u],
    ["git push -f origin main", /Dangerous Git/u],
    ["git filter-repo --force", /Dangerous Git/u],
    ["git stash clear", /Dangerous Git/u],
    ["git stash drop stash@{0}", /Dangerous Git/u],
    ["git switch -c BadBranch", /Branch Naming/u],
    ["git checkout --ours -- src/a.js src/b.js", /Bulk Conflict/u],
    ["git commit -m fix", /Commit Message/u],
    ["git commit -m \"$(cat <<'EOF'\nfix(core): bad transport\nEOF\n)\"", /Commit Heredoc/u],
    ["git worktree add .worktrees/feat-x -b feat/x", /Worktree Create/u],
    ["git -C repo worktree add /tmp/x", /Worktree Create/u],
  ];
  for (const [command, expected] of denied) {
    const findings = classifyDeliveryCommand(command, process.cwd());
    assert.match(findings.map((item) => item.id).join("\n"), expected, command);
    assert.equal(findings[0]?.action, "deny", command);
  }
});

test("command classifier preserves explicit and recoverable Git operations", () => {
  const allowed = [
    "git add src/app.mjs",
    "git add -A src/app.mjs",
    "git add :/src/app.mjs",
    "git add ':(literal)src/app.mjs'",
    "git add ':(top,literal)src/app.mjs'",
    "git clean -nd",
    "git push --force-with-lease origin feat/safe",
    "git switch -c feat/safe-delivery",
    "git checkout --ours -- src/app.mjs",
    "git commit -m 'fix(runtime): preserve recovery references'",
    "git commit --amend --no-edit",
    "AI_EXPERTS_ALLOW_GIT_STASH_DROP=1 git stash drop 'stash@{0}'",
    "git worktree list",
    "git worktree remove .worktrees/feat-x",
    "git worktree prune --dry-run",
  ];
  for (const command of allowed) {
    assert.deepEqual(classifyDeliveryCommand(command, process.cwd()), [], command);
  }
});

test("shell parsing finds wrapped and compound Git but ignores Git text arguments", () => {
  assert.equal(gitInvocations("echo git reset --hard", process.cwd()).length, 0);
  assert.equal(gitInvocations("env FLAG=1 command git -C /tmp status", process.cwd()).length, 1);
  const findings = classifyDeliveryCommand("printf ok && sudo git reset --hard", process.cwd());
  assert.match(findings[0]?.id ?? "", /Dangerous Git/u);
  assert.equal(classifyDeliveryCommand("echo 'git add .'", process.cwd()).length, 0);
});

test("classifies git behind /usr/bin/sudo and timeout", () => {
  const sudo = classifyDeliveryCommand("/usr/bin/sudo git reset --hard", process.cwd());
  assert.match(sudo[0]?.id ?? "", /Dangerous Git/u);
  const timeout = classifyDeliveryCommand("timeout 5 git push --force origin main", process.cwd());
  assert.match(timeout[0]?.id ?? "", /Dangerous Git/u);
});

test("pre entry emits a complete blocking contract for literal and magic bulk pathspecs", async () => {
  for (const command of ["git add .", "git add :/"]) {
    const result = await runEntry(PRE, {
      cwd: process.cwd(),
      tool_name: "exec_command",
      tool_input: { cmd: command },
    });
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny", command);
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /blockingContract:/u);
  }
});

test("pre entry denies direct writes to worktree authorization receipts", async () => {
  const root = createRepository("git-delivery-state-write-");
  try {
    const receipt = worktreeCreateReceiptPath(root, "forged-session");
    const result = await runEntry(PRE, {
      cwd: root,
      session_id: "forged-session",
      tool_name: "Write",
      tool_input: { file_path: receipt, content: "{\"allowed\":true}" },
    });
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /Authorization State Guard/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre entry denies interpreter writes to worktree authorization receipts", async () => {
  const root = createRepository("git-delivery-state-interpreter-write-");
  try {
    const result = await runEntry(PRE, {
      cwd: root,
      session_id: "forged-session",
      tool_name: "Bash",
      tool_input: {
        command: "node -e 'require(\"node:fs\").writeFileSync(\".git-delivery/state/forged.json\", \"{}\")'",
      },
    });
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /Authorization State Guard/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("merge marker detection is line anchored, bounded, and configurable", () => {
  assert.deepEqual(findMergeConflictMarkers([
    "=======",
    "column  column",
    "=======",
  ].join("\n")), []);
  const lateBoundary = findMergeConflictMarkers([
    ...Array.from({ length: 10 }, () => "======="),
    "<<<<<<< HEAD",
    "left",
    "=======",
    "right",
    ">>>>>>> branch",
  ].join("\n"));
  assert.equal(lateBoundary.length, 10);
  assert.deepEqual(lateBoundary.at(-1), { line: 11, marker: "<<<<<<<" });
  assert.deepEqual(findMergeConflictMarkers([
    "const example = '<<<<<<< not a marker';",
    "<<<<<<< HEAD", "left", "=======", "right", ">>>>>>> branch",
  ].join("\n")), [
    { line: 2, marker: "<<<<<<<" },
    { line: 4, marker: "=======" },
    { line: 6, marker: ">>>>>>>" },
  ]);
  const warnings = [];
  const config = resolveConflictConfig({
    checks: { mergeConflict: "report" },
    overrides: [
      { match: /^fixtures\//u, checks: { mergeConflict: "off" } },
      { match: "src", checks: { mergeConflict: "block" } },
    ],
  }, (message) => warnings.push(message));
  assert.equal(modeForConflict("fixtures/sample.txt", config), "off");
  assert.equal(modeForConflict("src/app.js", config), "report");
  assert.equal(config.checks.worktreeCreate, "block");
  assert.equal(warnings.length, 1);
  const worktreeWarnings = [];
  const worktreeConfig = resolveConflictConfig({
    checks: { worktreeCreate: "allow", mergeConflict: "block" },
  }, (message) => worktreeWarnings.push(message));
  assert.equal(worktreeConfig.checks.worktreeCreate, "allow");
  const invalidWorktree = resolveConflictConfig({
    checks: { worktreeCreate: "off" },
  }, (message) => worktreeWarnings.push(message));
  assert.equal(invalidWorktree.checks.worktreeCreate, "block");
  assert.equal(worktreeWarnings.length, 1);
});

test("post entry blocks a final conflicted file and allows a clean file", async () => {
  const root = createRepository("git-delivery-conflict-");
  try {
    mkdirSync(join(root, "src"));
    const target = join(root, "src", "app.js");
    writeFileSync(target, "<<<<<<< HEAD\nleft\n=======\nright\n>>>>>>> branch\n");
    const event = { cwd: root, tool_name: "Write", tool_input: { file_path: target } };
    const blocked = await runEntry(POST, event);
    assert.equal(blocked.code, 2);
    assert.match(blocked.stderr, /\[Git Delivery Guards\]/u);
    assert.match(blocked.stderr, /blockingContract:/u);
    writeFileSync(target, "export const value = 'resolved';\n");
    const clean = await runEntry(POST, event);
    assert.deepEqual(clean, { code: 0, stdout: "", stderr: "" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conflict configuration can downgrade a repository path to report", async () => {
  const root = createRepository("git-delivery-config-");
  try {
    mkdirSync(join(root, "fixtures"));
    writeFileSync(join(root, ".git-delivery.mjs"), [
      "export default {",
      "  overrides: [{ match: /^fixtures\\//, checks: { mergeConflict: 'report' } }],",
      "};",
      "",
    ].join("\n"));
    const target = join(root, "fixtures", "conflict.txt");
    writeFileSync(target, "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> branch\n");
    const result = await runEntry(POST, {
      cwd: root, tool_name: "Write", tool_input: { file_path: target },
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /Unresolved merge conflict/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("commit state reports partial staging and blocks invalid or cross-boundary scope", () => {
  const root = createRepository("git-delivery-scope-");
  try {
    for (const directory of ["a", "b"]) {
      mkdirSync(join(root, directory));
      writeFileSync(join(root, directory, "package.json"), "{}\n");
      writeFileSync(join(root, directory, "app.js"), "export const value = 1;\n");
    }
    git(root, "add", "a/package.json", "a/app.js", "b/package.json", "b/app.js");
    git(root, "commit", "-m", "feat(repo): initialize fixtures");
    writeFileSync(join(root, "a", "app.js"), "export const value = 2;\n");
    writeFileSync(join(root, "b", "app.js"), "export const value = 2;\n");
    git(root, "add", "a/app.js", "b/app.js");
    writeFileSync(join(root, "a", "app.js"), "export const value = 3;\n");
    const initial = deliveryStateFindings(root, "git commit -m 'fix(repo): update packages'");
    assert.match(initial.map((item) => item.id).join("\n"), /Partial Staging/u);
    assert.match(initial.map((item) => item.id).join("\n"), /Commit Scope/u);

    mkdirSync(join(root, ".ai-experts"));
    writeFileSync(join(root, ".ai-experts", "commit-boundaries.json"), JSON.stringify({
      version: 1,
      boundaries: [{ id: "workspace", prefixes: ["a", "b"] }],
    }));
    const grouped = deliveryStateFindings(root, "git commit -m 'fix(repo): update packages'");
    assert.doesNotMatch(grouped.filter((item) => item.action === "deny").map((item) => item.id).join("\n"), /Commit Scope/u);

    writeFileSync(join(root, ".ai-experts", "commit-boundaries.json"), "{ bad json");
    const invalid = deliveryStateFindings(root, "git commit -m 'fix(repo): update packages'");
    assert.equal(invalid.some((item) => item.id === "Commit Scope Guard" && item.action === "deny"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("worktree create intent matches explicit isolation requests only", () => {
  const requested = [
    "请用 git worktree 隔离审查这个 PR",
    "use a git worktree for this review",
    "create an isolated worktree and keep main checked out",
    "worktree add .worktrees/review-pr",
    "请创建隔离工作区继续改",
    "需要隔离 checkout 看另一条分支",
    "隔离检出后再跑测试",
    "spawn with isolation: worktree",
    "isolation = worktree for the child",
    "在 .worktrees/fix-login 里做",
    "新建一个 worktree 来并行",
    "开一个 worktree 给我",
  ];
  for (const prompt of requested) {
    assert.equal(userRequestedWorktreeCreate(prompt), true, prompt);
  }
  const ignored = [
    "keep a clean worktree",
    "the source worktree must stay unchanged",
    "report final worktree status",
    "inspect the working tree and branch",
    "不要用 git worktree",
    "do not create a worktree",
    "don't use git worktree add",
    "without a worktree, stay on this checkout",
    "分析这个 monorepo 的 package 边界，不要改 git 工作区",
    "fix the tests in the current checkout",
    "Run exactly `git worktree add /tmp/hs-feat-synthetic` once using Bash",
  ];
  for (const prompt of ignored) {
    assert.equal(userRequestedWorktreeCreate(prompt), false, prompt);
  }
});

test("worktree isolation is read from host tool input shapes", () => {
  assert.equal(worktreeIsolationRequested({ isolation: "worktree" }), true);
  assert.equal(worktreeIsolationRequested({ isolation: { type: "worktree" } }), true);
  assert.equal(worktreeIsolationRequested({ isolation: { mode: "worktree" } }), true);
  assert.equal(worktreeIsolationRequested({ isolation: "none" }), false);
  assert.equal(worktreeIsolationRequested({ prompt: "worktree" }), false);
  assert.equal(worktreeIsolationRequested({}), false);
});

test("pre entry denies unsolicited worktree add and host isolation", async () => {
  const root = createRepository("git-delivery-worktree-pre-");
  try {
    const denied = await runEntry(PRE, {
      cwd: root,
      session_id: "sess-deny",
      tool_name: "exec_command",
      tool_input: { cmd: "git worktree add .worktrees/feat-x -b feat/x" },
    });
    assert.equal(denied.code, 0, denied.stderr);
    const deniedOutput = JSON.parse(denied.stdout);
    assert.equal(deniedOutput.hookSpecificOutput.permissionDecision, "deny");
    assert.match(deniedOutput.hookSpecificOutput.permissionDecisionReason, /Worktree Create Guard/u);

    const isolated = await runEntry(PRE, {
      cwd: root,
      session_id: "sess-isolation",
      tool_name: "Task",
      tool_input: { isolation: "worktree", prompt: "review the branch" },
    });
    assert.equal(isolated.code, 0, isolated.stderr);
    assert.equal(JSON.parse(isolated.stdout).hookSpecificOutput.permissionDecision, "deny");

    recordWorktreeCreateAllowance(root, "sess-allow", "user-prompt");
    const allowed = await runEntry(PRE, {
      cwd: root,
      session_id: "sess-allow",
      tool_name: "exec_command",
      tool_input: { cmd: "git worktree add .worktrees/feat-x -b feat/x" },
    });
    assert.deepEqual(allowed, { code: 0, stdout: "", stderr: "" });

    writeFileSync(join(root, ".git-delivery.mjs"), "export default { checks: { worktreeCreate: 'allow' } };\n");
    const configured = await runEntry(PRE, {
      cwd: root,
      session_id: "sess-config",
      tool_name: "exec_command",
      tool_input: { cmd: "git worktree add .worktrees/feat-y" },
    });
    assert.deepEqual(configured, { code: 0, stdout: "", stderr: "" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("user prompt entry records explicit worktree requests and ignores negations", async () => {
  const root = mkdtempSync(join(tmpdir(), "git-delivery-prompt-"));
  try {
    const recorded = await runEntry(PROMPT, {
      cwd: root,
      session_id: "sess-prompt",
      prompt: "请创建隔离工作区继续改",
    });
    assert.equal(recorded.code, 0, recorded.stderr);
    assert.equal(recorded.stdout, "");
    assert.equal(readWorktreeCreateReceipt(root, "sess-prompt")?.source, "user-prompt");

    const ignored = await runEntry(PROMPT, {
      cwd: root,
      session_id: "sess-ignore",
      prompt: "分析这个 monorepo 的 package 边界，不要改 git 工作区",
    });
    assert.equal(ignored.code, 0, ignored.stderr);
    assert.equal(readWorktreeCreateReceipt(root, "sess-ignore"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("worktree create receipts permit only bundled user-prompt sources", () => {
  const root = mkdtempSync(join(tmpdir(), "git-delivery-worktree-"));
  try {
    assert.equal(isWorktreeCreatePermitted("block", null), false);
    assert.equal(isWorktreeCreatePermitted("allow", null), true);
    assert.equal(isWorktreeCreatePermitted("report", null), false);
    assert.equal(recordWorktreeCreateAllowance(root, "", "user-prompt"), false);
    assert.equal(readWorktreeCreateReceipt(root, "sess-user"), null);
    assert.equal(recordWorktreeCreateAllowance(root, "sess-user", "user-prompt"), true);
    const userReceipt = readWorktreeCreateReceipt(root, "sess-user");
    assert.equal(userReceipt?.source, "user-prompt");
    assert.equal(userReceipt?.allowed, true);
    assert.equal(isWorktreeCreatePermitted("block", userReceipt), true);
    assert.equal(recordWorktreeCreateAllowance(root, "sess-process", "process", "ci-gated-delivery:parallel-writers"), false);
    assert.equal(readWorktreeCreateReceipt(root, "sess-process"), null);
    mkdirSync(join(worktreeCreateReceiptPath(root, "sess-forged"), ".."), { recursive: true });
    writeFileSync(worktreeCreateReceiptPath(root, "sess-forged"), JSON.stringify({
      version: 1, allowed: true, source: "agent", createdAt: "2026-01-01T00:00:00.000Z",
    }));
    assert.equal(readWorktreeCreateReceipt(root, "sess-forged"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale lock cleanup requires an old lock with a confirmed dead PID", () => {
  const root = createRepository("git-delivery-lock-");
  const lock = join(root, ".git", "index.lock");
  try {
    writeFileSync(lock, `${process.pid}\n`);
    let findings = deliveryStateFindings(root, "git add src/app.js");
    assert.equal(findings.some((item) => item.action === "deny"), true);
    assert.equal(existsSync(lock), true);

    writeFileSync(lock, "2147483647\n");
    const old = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(lock, old, old);
    findings = deliveryStateFindings(root, "git add src/app.js");
    assert.equal(findings.some((item) => item.action === "report"), true);
    assert.equal(existsSync(lock), false);

    writeFileSync(lock, "not-a-pid\n");
    utimesSync(lock, old, old);
    findings = deliveryStateFindings(root, "git add src/app.js");
    assert.equal(findings.some((item) => item.action === "deny"), true);
    assert.equal(existsSync(lock), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
