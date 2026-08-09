import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../scripts/git-state-evidence-guard.mjs", import.meta.url));

function runStop(event) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, "stop"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

function initRepository(context) {
  const workspace = mkdtempSync(join(tmpdir(), "git-state-evidence-guard-"));
  context.after(() => rmSync(workspace, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q", "-b", "master"], { cwd: workspace });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: workspace });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: workspace });
  writeFileSync(join(workspace, "tracked.txt"), "clean\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: workspace });
  execFileSync("git", ["commit", "-q", "-m", "test"], { cwd: workspace });
  return workspace;
}

function block(value) {
  return ["```git-state-evidence", JSON.stringify(value), "```"].join("\n");
}

test("ordinary completion without git state evidence is a no-op", async () => {
  const result = await runStop({ cwd: process.cwd(), last_assistant_message: "Implemented the fix." });

  assert.deepEqual(result, { code: 0, stdout: "", stderr: "" });
});

test("a current explicit git state allows Stop", async (context) => {
  const workspace = initRepository(context);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim();
  const message = block({ schema: "git-state-evidence/v1", head, branch: "master", clean: true });

  const result = await runStop({ cwd: workspace, last_assistant_message: message });

  assert.deepEqual(result, { code: 0, stdout: "", stderr: "" });
});

test("a deterministic HEAD mismatch blocks Stop", async (context) => {
  const workspace = initRepository(context);
  const message = block({ schema: "git-state-evidence/v1", head: "0".repeat(40), branch: "master", clean: true });

  const result = await runStop({ cwd: workspace, last_assistant_message: message });

  assert.equal(result.code, 0);
  assert.match(JSON.parse(result.stdout).reason, /HEAD does not match/u);
});

test("branch and cleanliness mismatches block Stop", async (context) => {
  const workspace = initRepository(context);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim();
  writeFileSync(join(workspace, "untracked.txt"), "dirty\n");
  const message = block({ schema: "git-state-evidence/v1", head, branch: "feature", clean: true });

  const result = await runStop({ cwd: workspace, last_assistant_message: message });

  assert.equal(result.code, 0);
  const reason = JSON.parse(result.stdout).reason;
  assert.match(reason, /branch does not match/u);
  assert.match(reason, /clean does not match/u);
});

test("detached HEAD is represented by a null branch", async (context) => {
  const workspace = initRepository(context);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim();
  execFileSync("git", ["checkout", "-q", "--detach", head], { cwd: workspace });
  const message = block({ schema: "git-state-evidence/v1", head, branch: null, clean: true });

  const result = await runStop({ cwd: workspace, last_assistant_message: message });

  assert.deepEqual(result, { code: 0, stdout: "", stderr: "" });
});

test("malformed explicit git state reports and fails open", async () => {
  const message = block({ schema: "git-state-evidence/v1", head: "not-a-hash", branch: "master", clean: true });

  const result = await runStop({ cwd: process.cwd(), last_assistant_message: message });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /head is invalid/u);
});

test("an unclosed git state fence reports and fails open", async () => {
  const result = await runStop({
    cwd: process.cwd(),
    last_assistant_message: "```git-state-evidence\n{\"schema\":\"git-state-evidence/v1\"}",
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /expected exactly one git-state-evidence block/u);
});

test("a complete block followed by an unclosed git state block reports and fails open", async () => {
  const message = [
    block({ schema: "git-state-evidence/v1", head: "0".repeat(40), branch: "master", clean: true }),
    "```git-state-evidence",
    "{}",
  ].join("\n");

  const result = await runStop({ cwd: process.cwd(), last_assistant_message: message });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /expected exactly one git-state-evidence block/u);
});

test("a non-Git workspace reports and fails open", async (context) => {
  const workspace = mkdtempSync(join(tmpdir(), "git-state-evidence-guard-non-git-"));
  context.after(() => rmSync(workspace, { recursive: true, force: true }));
  const message = block({ schema: "git-state-evidence/v1", head: "0".repeat(40), branch: null, clean: true });

  const result = await runStop({ cwd: workspace, last_assistant_message: message });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Git state is unavailable/u);
});
