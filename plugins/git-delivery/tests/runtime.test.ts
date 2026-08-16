import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyDeliveryCommand, gitInvocations,
} from "../src/checks/command-rules.js";
import {
  findMergeConflictMarkers, modeForConflict, resolveConflictConfig,
} from "../src/checks/file-checks.js";
import { deliveryStateFindings } from "../src/checks/state-checks.js";

const PRE = fileURLToPath(new URL("../dist/hooks/git-delivery-hook-pre-tool.mjs", import.meta.url));
const POST = fileURLToPath(new URL("../dist/hooks/git-delivery-hook-post-tool.mjs", import.meta.url));

function runEntry(entry, event) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [entry], { stdio: ["pipe", "pipe", "pipe"] });
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
  const root = mkdtempSync(join(tmpdir(), prefix));
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
    "git clean -nd",
    "git push --force-with-lease origin feat/safe",
    "git switch -c feat/safe-delivery",
    "git checkout --ours -- src/app.mjs",
    "git commit -m 'fix(runtime): preserve recovery references'",
    "git commit --amend --no-edit",
    "AI_EXPERTS_ALLOW_GIT_STASH_DROP=1 git stash drop 'stash@{0}'",
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

test("pre entry emits a complete blocking contract", async () => {
  const result = await runEntry(PRE, {
    cwd: process.cwd(),
    tool_name: "exec_command",
    tool_input: { cmd: "git add ." },
  });
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /blockingContract:/u);
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
  assert.equal(warnings.length, 1);
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
