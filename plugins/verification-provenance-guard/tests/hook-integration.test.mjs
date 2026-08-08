import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_CONFIG, resolveConfig } from "../scripts/lib/config.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/verification-provenance-guard.mjs", import.meta.url));
const CODEX_HOOKS = fileURLToPath(new URL("../hooks/codex.json", import.meta.url));
const CLAUDE_HOOKS = fileURLToPath(new URL("../hooks/claude.json", import.meta.url));

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "verification-provenance-hook-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "app.js"), "export const value = 1;\n");
  return root;
}

function run(mode, event, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

function event(root, additions = {}) {
  return { cwd: root, session_id: "session-1", ...additions };
}

function validResponse(command = "node --test tests/*.test.mjs") {
  const claim = "Unit tests passed: 1/1.";
  return [
    "## Conclusions",
    "",
    `- [C1][locally-verified] ${claim}`,
    "",
    "```verification-evidence",
    JSON.stringify({
      schema: "verification-evidence/v1",
      completion: "done",
      claims: [{ id: "C1", predicate: "test_suite_passed", status: "verified", statement: claim, evidence: ["E1"] }],
      evidence: [{ id: "E1", kind: "command", command, exitCode: 0, summary: { passed: 1, failed: 0 } }],
    }, null, 2),
    "```",
  ].join("\n");
}

function v2Response(command = "node --test tests/*.test.mjs") {
  const claim = "Unit tests passed: 1/1.";
  return [
    "## Conclusions",
    "",
    `- [C1][locally-verified] ${claim}`,
    "",
    "```verification-evidence",
    JSON.stringify({
      schema: "verification-evidence/v2",
      completion: "done",
      workflow: {
        profile: "code_behavior",
        contract: "The public module exposes the requested behavior.",
        challenge: { kind: "red_test", evidence: ["E1"] },
        targetedVerification: ["E2"],
        completeVerification: ["E2"],
        adversarialReview: { status: "verified", statement: "The public regression path was rerun.", evidence: ["E2"] },
      },
      claims: [{ id: "C1", predicate: "test_suite_passed", status: "verified", statement: claim, evidence: ["E2"] }],
      evidence: [
        { id: "E1", kind: "command", command, outcome: "expected_failure", summary: { passed: 0, failed: 1 } },
        { id: "E2", kind: "command", command, outcome: "success", summary: { passed: 1, failed: 0 } },
      ],
    }, null, 2),
    "```",
  ].join("\n");
}

test("default config is strict and invalid overrides remain bounded", () => {
  const warnings = [];
  const config = resolveConfig({ mode: "bad", trigger: "bad", stop: { maxBlocks: 99 }, commands: { testPatterns: ["bad", /custom-test/u] } }, (message) => warnings.push(message));
  assert.equal(config.mode, DEFAULT_CONFIG.mode);
  assert.equal(config.trigger, DEFAULT_CONFIG.trigger);
  assert.equal(config.stop.maxBlocks, DEFAULT_CONFIG.stop.maxBlocks);
  assert.equal(config.commands.testPatterns.length, 1);
  assert.ok(warnings.length >= 4);
});

test("both hosts register prompt epochs and Codex scripts carry provenance variables", () => {
  const codex = JSON.parse(readFileSync(CODEX_HOOKS, "utf8"));
  const claude = JSON.parse(readFileSync(CLAUDE_HOOKS, "utf8"));
  assert.ok(codex.hooks.UserPromptSubmit);
  assert.ok(claude.hooks.UserPromptSubmit);
  for (const groups of Object.values(codex.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        assert.match(hook.command, /AI_EXPERTS_SESSION_ID=/u);
        assert.match(hook.command, /AI_EXPERTS_TRIGGER_FROM=/u);
      }
    }
  }
});

test("session hook injects the delivery and v2 reporting contracts", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "verification-provenance-data-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  const result = await run("session", event(root), { PLUGIN_DATA: data });
  assert.match(result.stdout, /evidence-driven-delivery/u);
  assert.match(result.stdout, /verification-evidence\/v2/u);
});

test("TDD sequence plus bare pass claim blocks; v2 manifest then clears state", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "verification-provenance-data-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  const env = { PLUGIN_DATA: data };
  await run("prompt", event(root, { prompt: "Add the requested behavior." }), env);
  await run("post", event(root, { tool_name: "Write", tool_input: { file_path: "tests/app.test.mjs" } }), env);
  await run("failure", event(root, {
    tool_name: "Bash",
    tool_input: { command: "node --test tests/*.test.mjs" },
    error: "Exit code 1\n# pass 0\n# fail 1\n",
    is_interrupt: false,
  }), env);
  await run("post", event(root, { tool_name: "Edit", tool_input: { file_path: "src/app.js" } }), env);
  await run("post", event(root, {
    tool_name: "Bash",
    tool_input: { command: "node --test tests/*.test.mjs" },
    tool_response: "# pass 1\n# fail 0\n",
  }), env);

  const blocked = await run("stop", event(root, { last_assistant_message: "All unit tests passed.\n\nDONE" }), env);
  assert.equal(JSON.parse(blocked.stdout).decision, "block");
  assert.match(blocked.stderr, /evidence is incomplete/u);

  const allowed = await run("stop", event(root, { last_assistant_message: v2Response() }), env);
  assert.equal(allowed.stdout, "");
  assert.equal(allowed.code, 0);
  const stateDirectory = join(data, "verification-provenance-guard");
  assert.equal(readdirSync(stateDirectory).length, 0);
});

test("a verification receipt becomes stale after another mutation", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "verification-provenance-data-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  const env = { PLUGIN_DATA: data };
  await run("prompt", event(root, { prompt: "Add the requested behavior." }), env);
  await run("post", event(root, { tool_name: "Write", tool_input: { file_path: "tests/app.test.mjs" } }), env);
  await run("failure", event(root, { tool_name: "Bash", tool_input: { command: "node --test tests/*.test.mjs" }, tool_response: "# pass 0\n# fail 1\nProcess exited with code 1\n" }), env);
  await run("post", event(root, { tool_name: "Edit", tool_input: { file_path: "src/app.js" } }), env);
  await run("post", event(root, { tool_name: "Bash", tool_input: { command: "node --test tests/*.test.mjs" }, tool_response: "# pass 1\n# fail 0\nProcess exited with code 0\n" }), env);
  await run("post", event(root, { tool_name: "Edit", tool_input: { file_path: "src/app.js" } }), env);
  const result = await run("stop", event(root, { last_assistant_message: v2Response() }), env);
  assert.equal(JSON.parse(result.stdout).decision, "block");
  assert.match(result.stderr, /after the last mutation/u);
});

test("a test command with a trailing workspace mutation cannot prove completion", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "verification-provenance-data-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  const env = { PLUGIN_DATA: data };
  const command = "node --test tests/*.test.mjs && sed -i s/1/2/ src/app.js";
  await run("post", event(root, {
    tool_name: "Bash",
    tool_input: { command },
    tool_response: "# pass 1\n# fail 0\nProcess exited with code 0\n",
  }), env);
  const result = await run("stop", event(root, { last_assistant_message: validResponse(command) }), env);
  assert.equal(JSON.parse(result.stdout).decision, "block");
  assert.match(result.stderr, /not a reliable success/u);
});

test("expected Stop violations remain blocked after the recovery-detail limit", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "verification-provenance-data-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  const env = { PLUGIN_DATA: data };
  await run("post", event(root, { tool_name: "Edit", tool_input: { file_path: "src/app.js" } }), env);
  const invalid = event(root, { last_assistant_message: "Implementation complete.", stop_hook_active: true });
  const first = await run("stop", invalid, env);
  const second = await run("stop", invalid, env);
  const third = await run("stop", invalid, env);
  assert.equal(JSON.parse(first.stdout).decision, "block");
  assert.equal(JSON.parse(second.stdout).decision, "block");
  assert.equal(JSON.parse(third.stdout).decision, "block");
  assert.doesNotMatch(third.stderr, /fail-open/u);
  const directory = join(data, "verification-provenance-guard");
  assert.equal(readdirSync(directory).length, 1);
  assert.doesNotMatch(readFileSync(join(directory, readdirSync(directory)[0]), "utf8"), /src\/app\.js|Implementation complete/u);
});

test("mutating completion requires v2 while a user verification-abort clears the trail", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "verification-provenance-data-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  const env = { PLUGIN_DATA: data };
  await run("prompt", event(root, { prompt: "Change the implementation." }), env);
  await run("post", event(root, { tool_name: "Edit", tool_input: { file_path: "src/app.js" } }), env);
  const legacy = await run("stop", event(root, { last_assistant_message: validResponse() }), env);
  assert.equal(JSON.parse(legacy.stdout).decision, "block");
  assert.match(legacy.stderr, /requires verification-evidence\/v2/u);

  await run("prompt", event(root, { prompt: "# verification-abort" }), env);
  const aborted = await run("stop", event(root, { last_assistant_message: "Stopped at the user's request." }), env);
  assert.equal(aborted.stdout, "");
  assert.equal(readdirSync(join(data, "verification-provenance-guard")).length, 0);
});

test("ordinary answers without mutation or evidence claims remain untouched", async (context) => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "verification-provenance-data-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); });
  const result = await run("stop", event(root, { last_assistant_message: "This concept can be explained in three parts." }), { PLUGIN_DATA: data });
  assert.deepEqual({ stdout: result.stdout, stderr: result.stderr, code: result.code }, { stdout: "", stderr: "", code: 0 });
});
