import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { isReliableTestCommand, parseReview } from "../scripts/swe-contract-verifier.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/swe-contract-verifier.mjs", import.meta.url));

function validReview(overrides = {}) {
  const fields = {
    verdict: "PASS",
    issue_contract: "covered",
    normal_path: "covered",
    empty_or_zero: "covered",
    boundary: "covered",
    error_path: "not_applicable: API has no error branch",
    regression_scope: "covered",
    test_scope: "pytest tests/test_api.py -q",
    ...overrides,
  };
  return ["SWE_CONTRACT_REVIEW_V1", ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`)].join("\n");
}

function run(mode, event, env) {
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

function fixture(context) {
  const cwd = mkdtempSync(join(tmpdir(), "swe-contract-workspace-"));
  const data = mkdtempSync(join(tmpdir(), "swe-contract-data-"));
  context.after(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });
  return { cwd, env: { PLUGIN_DATA: data }, session_id: "session-1" };
}

test("review report requires all dimensions and a specific N/A reason", () => {
  assert.equal(parseReview(validReview()).valid, true);
  assert.deepEqual(parseReview(validReview({ boundary: "skipped" })), { valid: false, reason: "invalid boundary" });
  assert.deepEqual(parseReview(validReview({ error_path: "not_applicable:" })), { valid: false, reason: "invalid error_path" });
  assert.deepEqual(parseReview(validReview({ issue_contract: "not_applicable: no issue" })), { valid: false, reason: "issue_contract must be covered" });
});

test("test command must be standalone and must not mask failure", () => {
  assert.equal(isReliableTestCommand("pytest tests/test_api.py -q"), true);
  assert.equal(isReliableTestCommand("python -m pytest tests/test_api.py"), true);
  assert.equal(isReliableTestCommand("cd repo && pytest -q"), false);
  assert.equal(isReliableTestCommand("pytest -q || true"), false);
  assert.equal(isReliableTestCommand("ruff check ."), false);
});

test("a mutation blocks until current-revision test and independent review exist", async (context) => {
  const fx = fixture(context);
  const event = (extra = {}) => ({ cwd: fx.cwd, session_id: fx.session_id, ...extra });
  await run("post", event({ tool_name: "Edit", tool_input: { file_path: "src/app.py" } }), fx.env);
  const initial = await run("stop", event({ last_assistant_message: "Done" }), fx.env);
  assert.equal(JSON.parse(initial.stdout).decision, "block");
  assert.match(initial.stdout, /test receipt/u);
  assert.match(initial.stdout, /independent PASS review/u);

  await run("post", event({
    tool_name: "Bash",
    tool_input: { command: "pytest tests/test_api.py -q" },
    tool_response: { exit_code: 0, stdout: "1 passed" },
  }), fx.env);
  await run("subagent-stop", event({ agent_id: "reviewer-1", last_assistant_message: validReview() }), fx.env);
  const allowed = await run("stop", event({ last_assistant_message: "Done" }), fx.env);
  assert.deepEqual({ code: allowed.code, stdout: allowed.stdout, stderr: allowed.stderr }, { code: 0, stdout: "", stderr: "" });
});

test("a later edit invalidates both receipts", async (context) => {
  const fx = fixture(context);
  const event = (extra = {}) => ({ cwd: fx.cwd, session_id: fx.session_id, ...extra });
  await run("post", event({ tool_name: "Edit" }), fx.env);
  await run("post", event({ tool_name: "Bash", tool_input: { command: "node --test test.mjs" }, tool_response: { exit_code: 0 } }), fx.env);
  await run("subagent-stop", event({ last_assistant_message: validReview() }), fx.env);
  await run("post", event({ tool_name: "Write" }), fx.env);
  const blocked = await run("stop", event({ last_assistant_message: "Done" }), fx.env);
  assert.equal(JSON.parse(blocked.stdout).decision, "block");
  assert.match(blocked.stdout, /latest mutation/u);
});

test("failed and compound tests do not create receipts", async (context) => {
  const fx = fixture(context);
  const event = (extra = {}) => ({ cwd: fx.cwd, session_id: fx.session_id, ...extra });
  await run("post", event({ tool_name: "Edit" }), fx.env);
  await run("post", event({ tool_name: "Bash", tool_input: { command: "pytest -q || true" }, tool_response: { exit_code: 0 } }), fx.env);
  await run("failure", event({ tool_name: "Bash", tool_input: { command: "pytest -q" }, tool_response: { exit_code: 1 } }), fx.env);
  await run("subagent-stop", event({ last_assistant_message: validReview() }), fx.env);
  const blocked = await run("stop", event({ last_assistant_message: "Done" }), fx.env);
  assert.equal(JSON.parse(blocked.stdout).decision, "block");
  assert.match(blocked.stdout, /test receipt/u);
});

test("session and subagent hooks inject the expected contracts", async (context) => {
  const fx = fixture(context);
  const base = { cwd: fx.cwd, session_id: fx.session_id };
  const session = JSON.parse((await run("session", base, fx.env)).stdout);
  const subagent = JSON.parse((await run("subagent-start", base, fx.env)).stdout);
  assert.equal(session.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(session.hookSpecificOutput.additionalContext, /swe-contract-verification/u);
  assert.equal(subagent.hookSpecificOutput.hookEventName, "SubagentStart");
  assert.match(subagent.hookSpecificOutput.additionalContext, /read-only/u);
});
