import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { classifyDeliveryCommand } from "../scripts/checks/command-rules.mjs";
import { deliveryStateFindings } from "../scripts/checks/state-checks.mjs";

const pre = fileURLToPath(new URL("../scripts/git-delivery-hook-pre-tool.mjs", import.meta.url));
const post = fileURLToPath(new URL("../scripts/git-delivery-hook-post-tool.mjs", import.meta.url));
function run(entry, payload) { return new Promise((resolve, reject) => { const child = spawn(process.execPath, [entry], { stdio: ["pipe", "pipe", "pipe"] }); const out = [], err = []; child.stdout.on("data", (chunk) => out.push(chunk)); child.stderr.on("data", (chunk) => err.push(chunk)); child.once("error", reject); child.once("close", (code) => resolve({ code, stdout: Buffer.concat(out).toString("utf8").trim(), stderr: Buffer.concat(err).toString("utf8") })); child.stdin.end(JSON.stringify(payload)); }); }

test("command classifier covers destructive, staging, naming, message, SVN, and remote mutations", () => {
  const cases = [
    ["git reset --hard", "deny", "Dangerous Git"],
    ["git -C /tmp/example reset --hard", "deny", "Dangerous Git"],
    ["git add -A", "deny", "Git Add"],
    ["git switch -c BadBranch", "deny", "Branch Naming"],
    ["git commit -m fix", "deny", "Commit Message"],
    ["svn add .", "deny", "SVN Add"],
    ["gh workflow disable deploy.yml", "report", "GitHub"],
    ["glab mr merge 12", "report", "GitLab"],
  ];
  for (const [command, action, id] of cases) { const result = classifyDeliveryCommand(command, process.cwd())[0]; assert.equal(result.action, action, command); assert.match(result.id, new RegExp(id, "u"), command); }
  assert.deepEqual(classifyDeliveryCommand("git add src/app.mjs", process.cwd()), []);
  assert.deepEqual(classifyDeliveryCommand("git add -A src/app.mjs", process.cwd()), []);
  assert.deepEqual(classifyDeliveryCommand("git push --force-with-lease", process.cwd()), []);
});

test("pre entry emits a complete deny contract for bulk staging", async () => {
  const result = await run(pre, { cwd: process.cwd(), tool_name: "exec_command", tool_input: { cmd: "git add ." } }); assert.equal(result.code, 0, result.stderr); const output = JSON.parse(result.stdout); assert.equal(output.hookSpecificOutput.permissionDecision, "deny"); assert.match(output.hookSpecificOutput.permissionDecisionReason, /blockingContract/u);
});

test("post entry reports merge markers and duplicate GitLab pipeline rules", async () => {
  const root = mkdtempSync(join(tmpdir(), "git-delivery-"));
  try {
    const conflict = join(root, "conflict.txt"); writeFileSync(conflict, "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> branch\n"); const first = await run(post, { tool_name: "Write", tool_input: { file_path: conflict } }); assert.match(first.stdout, /Merge Conflict/u);
    const ci = join(root, ".gitlab-ci.yml"); writeFileSync(ci, "workflow:\n  rules:\n    - if: '$CI_PIPELINE_SOURCE == \"merge_request_event\"'\n    - if: '$CI_COMMIT_BRANCH'\n"); const second = await run(post, { tool_name: "Write", tool_input: { file_path: ci } }); assert.match(second.stdout, /duplicate-pipeline/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("git-destructive-command-guard preserves recovery refs, restore, clean, and stash rules", () => {
  for (const command of [
    "git update-ref -d refs/original/refs/heads/main",
    "git restore --source=HEAD src/app.mjs",
    "git clean -d",
    "git stash drop stash@{0}",
    "AI_EXPERTS_ALLOW_GIT_STASH_DROP=1 git stash drop stash@{0} extra",
  ]) assert.equal(classifyDeliveryCommand(command, process.cwd())[0]?.action, "deny", command);
  assert.deepEqual(classifyDeliveryCommand("AI_EXPERTS_ALLOW_GIT_STASH_DROP=1 git stash drop 'stash@{0}'", process.cwd()), []);
});

test("git-commit-message-guard validates -F files and -C working directories", () => {
  const root = mkdtempSync(join(tmpdir(), "git-message-"));
  try {
    writeFileSync(join(root, "bad-message.txt"), "fix\n");
    const finding = classifyDeliveryCommand(`git -C ${root} commit -F bad-message.txt`, process.cwd())[0];
    assert.equal(finding?.action, "deny");
    assert.match(finding?.id ?? "", /Commit Message/u);
    writeFileSync(join(root, "good-message.txt"), "fix(runtime): preserve explicit recovery refs\n");
    assert.deepEqual(classifyDeliveryCommand(`git -C ${root} commit -F good-message.txt`, process.cwd()), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("git-commit-scope-guard honors explicit commit boundaries", () => {
  const root = mkdtempSync(join(tmpdir(), "git-scope-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  try {
    git("init", "-b", "main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.invalid");
    for (const directory of ["a", "b"]) { mkdirSync(join(root, directory)); writeFileSync(join(root, directory, "package.json"), "{}\n"); writeFileSync(join(root, directory, "app.js"), "export const value = 1;\n"); }
    git("add", "."); git("commit", "-m", "feat(repo): initialize fixtures");
    for (const directory of ["a", "b"]) writeFileSync(join(root, directory, "app.js"), "export const value = 2;\n");
    git("add", "a/app.js", "b/app.js");
    assert.match(deliveryStateFindings(root, "git commit -m 'fix(repo): update both packages'").map((item) => item.id).join("\n"), /Commit Scope/u);
    mkdirSync(join(root, ".ai-experts"));
    writeFileSync(join(root, ".ai-experts", "commit-boundaries.json"), JSON.stringify({ version: 1, boundaries: [{ id: "workspace", prefixes: ["a", "b"] }] }));
    assert.doesNotMatch(deliveryStateFindings(root, "git commit -m 'fix(repo): update both packages'").map((item) => item.id).join("\n"), /Commit Scope/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
