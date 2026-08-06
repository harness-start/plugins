import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { classifyDeliveryCommand } from "../scripts/checks/command-rules.mjs";

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
