import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_CONFIG, resolveConfig } from "../scripts/lib/config.mjs";
import {
  countRemotePolls,
  estimateSleepSeconds,
  inferCommandOutcome,
  isReadOnlyCommand,
  isVerificationCommand,
  normalizeCommand,
} from "../scripts/lib/execution-loop-policy.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/execution-loop-guard.mjs", import.meta.url));

function workspace(prefix = "execution-loop-guard-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.js"), "export const value = 0;\n");
  return root;
}

function runEntry(mode, event, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(typeof event === "string" ? event : JSON.stringify(event));
  });
}

function fileEvent(root, session = "session-1", path = "src/app.js") {
  return {
    cwd: root,
    session_id: session,
    tool_name: "Edit",
    tool_input: { file_path: path, old_string: "0", new_string: "1" },
  };
}

function shellEvent(root, command, response, session = "session-1") {
  return {
    cwd: root,
    session_id: session,
    tool_name: "Bash",
    tool_input: { command },
    tool_response: response,
  };
}

test("default edit window reports at 5 and blocks at 20", () => {
  const config = resolveConfig(null);
  assert.equal(config.editLoop.reportAt, 5);
  assert.equal(config.editLoop.blockAt, 20);
  assert.equal(config.editLoop.windowMinutes, 30);
  assert.equal(config.checks.remotePolling, "report");
});

test("config validates modes, threshold ordering, regexes, and custom exemptions", () => {
  const warnings = [];
  const config = resolveConfig({
    checks: { editLoop: "report", remotePolling: "bad" },
    editLoop: { reportAt: 7, blockAt: 6, exemptPaths: [/^docs\//, "bad"] },
    commandRepeat: { retryBypass: "bad" },
  }, (message) => warnings.push(message));

  assert.equal(config.checks.editLoop, "report");
  assert.equal(config.checks.remotePolling, DEFAULT_CONFIG.checks.remotePolling);
  assert.equal(config.editLoop.reportAt, DEFAULT_CONFIG.editLoop.reportAt);
  assert.equal(config.editLoop.blockAt, DEFAULT_CONFIG.editLoop.blockAt);
  assert.equal(config.editLoop.exemptPaths.length, 2);
  assert.ok(warnings.length >= 4);
});

test("command normalization ignores observer noise but preserves semantic arguments", () => {
  assert.equal(normalizeCommand("pnpm test 2>&1 | tail -20"), "pnpm test");
  assert.equal(normalizeCommand("pnpm test > out.log"), "pnpm test");
  assert.notEqual(normalizeCommand("pnpm test --filter a"), normalizeCommand("pnpm test --filter b"));
});

test("read-only and verification classifiers avoid trivial resets", () => {
  assert.equal(isReadOnlyCommand("MODE=x git status"), true);
  assert.equal(isReadOnlyCommand("RESULT=$(rg TODO src)"), true);
  assert.equal(isReadOnlyCommand("node build.mjs"), false);
  assert.equal(isVerificationCommand("node --test tests/*.test.mjs"), true);
  assert.equal(isVerificationCommand("echo ok"), false);
});

test("polling estimator handles loops, caps, and known remote clients", () => {
  const settings = { maxSleepPerCommandSeconds: 100, whileLoopAssumedIterations: 10 };
  assert.equal(estimateSleepSeconds("for i in {1..4}; do sleep 5; done", settings), 20);
  assert.equal(estimateSleepSeconds("while true; do sleep 30; done", settings), 100);
  assert.equal(countRemotePolls("glab ci status"), 1);
  assert.equal(countRemotePolls("gh pr checks 12"), 1);
  assert.equal(countRemotePolls("git status"), 0);
});

test("outcome inference supports Codex text, structured responses, and forced Claude failures", () => {
  assert.equal(inferCommandOutcome({ tool_response: "Process exited with code 2\n" }), "failure");
  assert.equal(inferCommandOutcome({ tool_response: { exit_code: 0 } }), "success");
  assert.equal(inferCommandOutcome({ tool_response: { is_error: true } }), "failure");
  assert.equal(inferCommandOutcome({}, true), "failure");
  assert.equal(inferCommandOutcome({}), "unknown");
  assert.equal(inferCommandOutcome({ tool_response: "all good with no exit line" }), "unknown");
});

test("edit loop reports, blocks, then starts a fresh cycle", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "execution-loop-state-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  writeFileSync(join(root, ".execution-loop-guard.mjs"), [
    "export default {",
    "  editLoop: { reportAt: 2, blockAt: 3, windowMinutes: 30 },",
    "};",
    "",
  ].join("\n"));
  const env = { PLUGIN_DATA: data };

  const first = await runEntry("post", fileEvent(root), env);
  const second = await runEntry("post", fileEvent(root), env);
  const third = await runEntry("post", fileEvent(root), env);
  const fourth = await runEntry("post", fileEvent(root), env);

  assert.equal(first.stdout, "");
  assert.match(second.stdout, /High-frequency edits/u);
  assert.equal(third.code, 2);
  assert.match(third.stderr, /Edit loop blocked/u);
  assert.equal(fourth.stdout, "");
  assert.equal(fourth.code, 0);
});

test("successful verification clears edit counters for the session and workspace", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "execution-loop-state-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  writeFileSync(join(root, ".execution-loop-guard.mjs"), "export default { editLoop: { reportAt: 2, blockAt: 3 } };\n");
  const env = { PLUGIN_DATA: data };

  await runEntry("post", fileEvent(root), env);
  await runEntry("post", shellEvent(root, "node --test", { exit_code: 0 }), env);
  const afterVerify = await runEntry("post", fileEvent(root), env);

  assert.equal(afterVerify.code, 0);
  assert.equal(afterVerify.stdout, "");
  assert.equal(afterVerify.stderr, "");
});

test("failed verification preserves edit counters", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "execution-loop-state-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  writeFileSync(join(root, ".execution-loop-guard.mjs"), "export default { editLoop: { reportAt: 2, blockAt: 3 } };\n");
  const env = { PLUGIN_DATA: data };

  await runEntry("post", fileEvent(root), env);
  await runEntry("post", shellEvent(root, "node --test", { exit_code: 1 }), env);
  const afterVerify = await runEntry("post", fileEvent(root), env);

  assert.equal(afterVerify.code, 0);
  assert.match(afterVerify.stdout, /High-frequency edits/u);
});

test("failed command reports on the second attempt and blocks the third", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "execution-loop-state-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  const env = { PLUGIN_DATA: data };
  const failure = shellEvent(root, "node failing.mjs", { exit_code: 1, stderr: "same failure" });

  await runEntry("failure", failure, env);
  const secondPre = await runEntry("pre", failure, env);
  await runEntry("failure", failure, env);
  const thirdPre = await runEntry("pre", failure, env);
  const freshPre = await runEntry("pre", failure, env);

  assert.match(secondPre.stdout, /failed command repeated 2 times/u);
  assert.equal(JSON.parse(thirdPre.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.match(thirdPre.stdout, /blockingContract/u);
  assert.equal(freshPre.stdout, "");
});

test("changing a command's direct file input resets only that repetition cycle", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "execution-loop-state-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  const env = { PLUGIN_DATA: data };
  writeFileSync(join(root, "proof.mjs"), "throw new Error('red v1');\n");
  writeFileSync(join(root, "other.mjs"), "export const other = 1;\n");
  const failure = shellEvent(root, "node proof.mjs", { exit_code: 1, stderr: "still red" });

  await runEntry("failure", failure, env);
  writeFileSync(join(root, "proof.mjs"), "throw new Error('red v2');\n");
  await runEntry("post", fileEvent(root, "session-1", "proof.mjs"), env);
  const afterEdit = await runEntry("pre", failure, env);
  await runEntry("failure", failure, env);
  writeFileSync(join(root, "other.mjs"), "export const other = 2;\n");
  await runEntry("post", fileEvent(root, "session-1", "other.mjs"), env);
  const afterUnrelatedEdit = await runEntry("pre", failure, env);

  assert.equal(afterEdit.stdout, "", "the same verification command now observes a changed workspace");
  assert.match(afterUnrelatedEdit.stdout, /failed command repeated 2 times/u, "an unrelated edit must not launder the retry cycle");
});

test("retry bypass clears the command cycle", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "execution-loop-state-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  const env = { PLUGIN_DATA: data };

  await runEntry("failure", shellEvent(root, "node failing.mjs", { exit_code: 1 }), env);
  await runEntry("post", shellEvent(root, "node failing.mjs # retry-ok", { exit_code: 0 }), env);
  const result = await runEntry("pre", shellEvent(root, "node failing.mjs", null), env);

  assert.equal(result.stdout, "");
});

test("remote polling remains report-only by default", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "execution-loop-state-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  writeFileSync(join(root, ".execution-loop-guard.mjs"), "export default { polling: { queryBudgetCount: 1 } };\n");
  const result = await runEntry("pre", shellEvent(root, "glab ci status", null), { PLUGIN_DATA: data });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Remote polling budget exceeded/u);
  assert.doesNotMatch(result.stdout, /permissionDecision/u);
});

test("remote polling block mode returns a recovery contract", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "execution-loop-state-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  writeFileSync(join(root, ".execution-loop-guard.mjs"), [
    "export default {",
    "  checks: { remotePolling: 'block' },",
    "  polling: { queryBudgetCount: 1 },",
    "};",
    "",
  ].join("\n"));
  const result = await runEntry("pre", shellEvent(root, "glab ci status", null), { PLUGIN_DATA: data });

  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /blockingContract:/u);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /# poll-ok/u);
});

test("state does not persist raw paths, commands, or command output", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "execution-loop-state-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  const env = { PLUGIN_DATA: data };
  await runEntry("post", fileEvent(root), env);
  await runEntry("failure", shellEvent(root, "node secret-command.mjs", { exit_code: 1, stderr: "private-output" }), env);

  const directory = join(data, "execution-loop-guard");
  const state = readFileSync(join(directory, readdirSync(directory)[0]), "utf8");
  assert.doesNotMatch(state, /src\/app\.js|secret-command|private-output/u);
});

test("malformed input and missing plugin data fail open", async () => {
  const malformed = await runEntry("pre", "{");
  const noData = await runEntry("post", fileEvent("/tmp"), { PLUGIN_DATA: "" });
  assert.deepEqual({ code: malformed.code, stdout: malformed.stdout, stderr: malformed.stderr }, { code: 0, stdout: "", stderr: "" });
  assert.equal(noData.code, 0);
});
