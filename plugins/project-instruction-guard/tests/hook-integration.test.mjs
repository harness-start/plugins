import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { inspectProjectInstructions, reconcileProjectInstructions } from "../scripts/lib/project-instructions.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/project-instruction-guard.mjs", import.meta.url));
const CLI = fileURLToPath(new URL("../scripts/project-instructions-cli.mjs", import.meta.url));

function repository(valid = true) {
  const root = mkdtempSync(join(tmpdir(), "project-instruction-hook-"));
  execFileSync("git", ["init", "-q", root]);
  if (valid) {
    const before = inspectProjectInstructions(root);
    reconcileProjectInstructions({ workspace: root, expectedStateDigest: before.stateDigest });
  }
  return root;
}

function runHook(mode, event, env = {}) {
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
    child.stdin.end(JSON.stringify(event));
  });
}

function runCli(root, args, extraEnv = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      AI_EXPERTS_SESSION_ID: "session-1",
      AI_EXPERTS_TRIGGER_FROM: "test",
      ...extraEnv,
    },
  }).trim();
}

function runCodexHostShape(root, args) {
  const environment = { ...process.env, CODEX_THREAD_ID: "session-1" };
  delete environment.AI_EXPERTS_SESSION_ID;
  const suffix = args
    .map((value, index) => index === 0 || value.startsWith("--") ? value : JSON.stringify(value))
    .join(" ");
  const command = 'AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-${CODEX_THREAD_ID:-manual}}" AI_EXPERTS_TRIGGER_FROM="skill:project-instruction-maintenance" '
    + `node "${CLI}" ${suffix}`;
  const output = execFileSync("bash", ["-lc", command], { encoding: "utf8", env: environment }).trim();
  return { command, output };
}

function event(root, additions = {}) {
  return { cwd: root, session_id: "session-1", ...additions };
}

test("SessionStart reports invalid Git roots and ignores non-Git workspaces", async (context) => {
  const root = repository(false);
  const outside = mkdtempSync(join(tmpdir(), "project-instruction-outside-"));
  const data = mkdtempSync(join(tmpdir(), "project-instruction-data-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });

  const reported = await runHook("session", event(root), { PLUGIN_DATA: data });
  assert.match(reported.stdout, /Project Instruction Guard/u);
  assert.match(reported.stdout, /stateDigest=/u);
  assert.match(reported.stdout, /project-instruction-maintenance/u);

  const ignored = await runHook("session", event(outside), { PLUGIN_DATA: data });
  assert.deepEqual({ stdout: ignored.stdout, stderr: ignored.stderr, code: ignored.code }, { stdout: "", stderr: "", code: 0 });
});

test("a project mutation blocks Stop until a matching final verification receipt", async (context) => {
  const root = repository();
  const data = mkdtempSync(join(tmpdir(), "project-instruction-data-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });
  const env = { PLUGIN_DATA: data };

  await runHook("post", event(root, { tool_name: "Edit", tool_input: { file_path: "src/app.js" }, tool_response: { exit_code: 0 } }), env);
  const blocked = await runHook("stop", event(root, { last_assistant_message: "实现完成。\n\nDONE" }), env);
  assert.equal(JSON.parse(blocked.stdout).decision, "block");
  assert.match(blocked.stderr, /最后一次变化之后/u);

  const receipt = runCli(root, ["verify", "--workspace", root, "--decision", "no-change"]);
  await runHook("post", event(root, {
    tool_name: "Bash",
    tool_input: { command: `node "${CLI}" verify --workspace "${root}" --decision no-change` },
    tool_response: { exit_code: 0, output: receipt },
  }), env);
  const allowed = await runHook("stop", event(root, { last_assistant_message: "实现完成。\n\nDONE" }), env);
  assert.deepEqual({ stdout: allowed.stdout, stderr: allowed.stderr, code: allowed.code }, { stdout: "", stderr: "", code: 0 });
});

test("Codex host shape derives receipt provenance from CODEX_THREAD_ID", async (context) => {
  const root = repository();
  const data = mkdtempSync(join(tmpdir(), "project-instruction-data-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });
  const env = { PLUGIN_DATA: data };
  await runHook("post", event(root, { tool_name: "Edit", tool_response: { exit_code: 0 } }), env);
  const verification = runCodexHostShape(root, ["verify", "--workspace", root, "--decision", "no-change"]);
  await runHook("post", event(root, {
    tool_name: "Bash",
    tool_input: { command: verification.command },
    tool_response: { exit_code: 0, output: verification.output },
  }), env);
  const allowed = await runHook("stop", event(root, { last_assistant_message: "DONE" }), env);
  assert.equal(allowed.stdout, "");
});

test("changed verification must link the authenticated reconcile receipt", async (context) => {
  const root = repository(false);
  const data = mkdtempSync(join(tmpdir(), "project-instruction-data-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });
  const env = { PLUGIN_DATA: data };
  const inspected = JSON.parse(runCli(root, ["inspect", "--workspace", root]));
  const reconcileText = runCli(root, [
    "reconcile", "--workspace", root,
    "--expected-state-digest", inspected.result.stateDigest,
  ]);
  const reconciled = JSON.parse(reconcileText);
  await runHook("post", event(root, {
    tool_name: "Bash",
    tool_input: {
      command: `node "${CLI}" reconcile --workspace "${root}" --expected-state-digest ${inspected.result.stateDigest}`,
    },
    tool_response: { exit_code: 0, output: reconcileText },
  }), env);

  const wrong = runCli(root, [
    "verify", "--workspace", root,
    "--decision", "changed",
    "--expected-revision-id", reconciled.result.revisionId,
    "--verifies-invocation-id", "wrong-invocation",
  ]);
  await runHook("post", event(root, {
    tool_name: "Bash",
    tool_input: {
      command: `node "${CLI}" verify --workspace "${root}" --decision changed --expected-revision-id ${reconciled.result.revisionId} --verifies-invocation-id wrong-invocation`,
    },
    tool_response: { exit_code: 0, output: wrong },
  }), env);
  const blocked = await runHook("stop", event(root, { last_assistant_message: "DONE" }), env);
  assert.equal(JSON.parse(blocked.stdout).decision, "block");

  const verified = runCli(root, [
    "verify", "--workspace", root,
    "--decision", "changed",
    "--expected-revision-id", reconciled.result.revisionId,
    "--verifies-invocation-id", reconciled.invocationId,
  ]);
  await runHook("post", event(root, {
    tool_name: "Bash",
    tool_input: {
      command: `node "${CLI}" verify --workspace "${root}" --decision changed --expected-revision-id ${reconciled.result.revisionId} --verifies-invocation-id ${reconciled.invocationId}`,
    },
    tool_response: { exit_code: 0, output: verified },
  }), env);
  const allowed = await runHook("stop", event(root, { last_assistant_message: "DONE" }), env);
  assert.equal(allowed.stdout, "");
});

test("verification becomes stale after a later mutation", async (context) => {
  const root = repository();
  const data = mkdtempSync(join(tmpdir(), "project-instruction-data-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });
  const env = { PLUGIN_DATA: data };
  const receipt = runCli(root, ["verify", "--workspace", root, "--decision", "no-change"]);
  await runHook("post", event(root, {
    toolName: "exec_command",
    toolInput: { cmd: `node "${CLI}" verify --workspace "${root}" --decision no-change` },
    toolResponse: { exitCode: 0, stdout: receipt },
  }), env);
  await runHook("post", event(root, { toolName: "apply_patch", toolResponse: { exitCode: 0 } }), env);

  const result = await runHook("stop", event(root, { lastAssistantMessage: "DONE" }), env);
  assert.equal(JSON.parse(result.stdout).decision, "block");
  assert.match(result.stderr, /mutationRevision=1/u);
});

test("forged, chained, stale, and sessionless verification receipts are ignored", async (context) => {
  const root = repository();
  const data = mkdtempSync(join(tmpdir(), "project-instruction-data-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });
  const env = { PLUGIN_DATA: data };
  await runHook("post", event(root, { tool_name: "Write", tool_response: { exit_code: 0 } }), env);

  const valid = JSON.parse(runCli(root, ["verify", "--workspace", root, "--decision", "no-change"]));
  const attempts = [
    { command: "echo project-instructions-verify", receipt: valid },
    { command: `node "${CLI}" verify --workspace "${root}" --decision no-change && echo ok`, receipt: valid },
    { command: `node "${CLI}" verify --workspace "${root}" --decision no-change`, receipt: { ...valid, observedAt: "2000-01-01T00:00:00.000Z" } },
    { command: `node "${CLI}" verify --workspace "${root}" --decision no-change`, receipt: { ...valid, provenance: { ...valid.provenance, sessionPresent: false } } },
  ];
  for (const attempt of attempts) {
    await runHook("post", event(root, {
      tool_name: "Bash",
      tool_input: { command: attempt.command },
      tool_response: { exit_code: 0, output: JSON.stringify(attempt.receipt) },
    }), env);
  }
  const result = await runHook("stop", event(root, { last_assistant_message: "DONE" }), env);
  assert.equal(JSON.parse(result.stdout).decision, "block");
});

test("read-only prefixes cannot hide a trailing workspace mutation", async (context) => {
  const root = repository();
  const data = mkdtempSync(join(tmpdir(), "project-instruction-data-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });
  const env = { PLUGIN_DATA: data };
  await runHook("post", event(root, {
    tool_name: "Bash",
    tool_input: { command: "git status --short && touch changed.txt" },
    tool_response: { exit_code: 0 },
  }), env);
  const result = await runHook("stop", event(root, { last_assistant_message: "DONE" }), env);
  assert.equal(JSON.parse(result.stdout).decision, "block");
});

test("compound read-only commands remain exempt, including git -C", async (context) => {
  const root = repository();
  const data = mkdtempSync(join(tmpdir(), "project-instruction-data-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });
  const env = { PLUGIN_DATA: data };
  await runHook("post", event(root, {
    tool_name: "Bash",
    tool_input: { command: `ls -la "${root}" && git -C "${root}" status --short` },
    tool_response: { exit_code: 0 },
  }), env);
  const result = await runHook("stop", event(root, { last_assistant_message: "DONE" }), env);
  assert.equal(result.stdout, "");
});

test("quoted command substitutions cannot masquerade as trusted CLI reads", async (context) => {
  const root = repository();
  const data = mkdtempSync(join(tmpdir(), "project-instruction-data-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });
  const env = { PLUGIN_DATA: data };
  await runHook("post", event(root, {
    tool_name: "Bash",
    tool_input: { command: `node "${CLI}" inspect --workspace "$(touch notes.txt; pwd)"` },
    tool_response: { exit_code: 0, output: "{}" },
  }), env);
  const result = await runHook("stop", event(root, { last_assistant_message: "DONE" }), env);
  assert.equal(JSON.parse(result.stdout).decision, "block");
});

test("expired clean state becomes dirty instead of silently resetting", async (context) => {
  const root = repository();
  const data = mkdtempSync(join(tmpdir(), "project-instruction-data-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });
  const env = { PLUGIN_DATA: data };
  await runHook("post", event(root, { tool_name: "Edit", tool_response: { exit_code: 0 } }), env);
  const receipt = runCli(root, ["verify", "--workspace", root, "--decision", "no-change"]);
  await runHook("post", event(root, {
    tool_name: "Bash",
    tool_input: { command: `node "${CLI}" verify --workspace "${root}" --decision no-change` },
    tool_response: { exit_code: 0, output: receipt },
  }), env);
  const directory = join(data, "project-instruction-guard");
  const path = join(directory, readdirSync(directory)[0]);
  const state = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, `${JSON.stringify({ ...state, updatedAt: 1 })}\n`);

  const result = await runHook("stop", event(root, { last_assistant_message: "DONE" }), env);
  assert.equal(JSON.parse(result.stdout).decision, "block");
});

test("invalid structure blocks independently, while report/off and blocked handoff remain bounded", async (context) => {
  const root = repository(false);
  const data = mkdtempSync(join(tmpdir(), "project-instruction-data-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });
  const env = { PLUGIN_DATA: data };

  const strict = await runHook("stop", event(root, { last_assistant_message: "DONE" }), env);
  assert.equal(JSON.parse(strict.stdout).decision, "block");
  assert.match(strict.stderr, /结构未闭合/u);

  const handoff = await runHook("stop", event(root, { last_assistant_message: "BLOCKED\n\n需要用户选择规则。" }), env);
  assert.equal(handoff.stdout, "");

  writeFileSync(join(root, ".project-instruction-guard.mjs"), "export default { mode: 'report' };\n");
  const report = await runHook("stop", event(root, { last_assistant_message: "DONE" }), env);
  assert.equal(report.stdout, "");
  assert.match(report.stderr, /结构未闭合/u);

  writeFileSync(join(root, ".project-instruction-guard.mjs"), "export default { mode: 'off' };\n");
  const off = await runHook("stop", event(root, { last_assistant_message: "DONE" }), env);
  assert.deepEqual({ stdout: off.stdout, stderr: off.stderr }, { stdout: "", stderr: "" });
});

test("active Stop retries fail open without erasing unresolved state", async (context) => {
  const root = repository();
  const data = mkdtempSync(join(tmpdir(), "project-instruction-data-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });
  const env = { PLUGIN_DATA: data };
  await runHook("post", event(root, { tool_name: "Edit", tool_response: { exit_code: 0 } }), env);

  const retry = await runHook("stop", event(root, { stop_hook_active: true, last_assistant_message: "DONE" }), env);
  assert.equal(retry.stdout, "");
  assert.match(retry.stderr, /recursively blocking/u);
  const later = await runHook("stop", event(root, { last_assistant_message: "DONE" }), env);
  assert.equal(JSON.parse(later.stdout).decision, "block");
});
