import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { regressionContract } from "./fixtures.mjs";
import { commandObservation } from "../scripts/lib/hook-io.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/behavioral-regression-guard.mjs", import.meta.url));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "behavioral-public-"));
  const data = mkdtempSync(join(tmpdir(), "behavioral-public-data-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  for (const directory of [".behavioral-regression", "src", "test"]) mkdirSync(join(root, directory));
  writeFileSync(join(root, "src", "normalize.js"), "bug\n");
  for (const name of ["primary", "boundary", "representation", "compat"]) writeFileSync(join(root, "test", `${name}.mjs`), `// ${name}\n`);
  const path = join(root, ".behavioral-regression", "BR-20260809-normalize.json");
  writeFileSync(path, `${JSON.stringify(regressionContract(), null, 2)}\n`);
  return { root, data, path };
}

function runHook(mode, event, env = {}) {
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

test("public hook is idle without activation and blocks Stop after contract activation", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  const idle = await runHook("stop", { cwd: fx.root, session_id: "idle" }, env);
  assert.equal(idle.stdout, "");

  const active = await runHook("post", { cwd: fx.root, session_id: "s", tool_name: "Write", tool_input: { file_path: fx.path } }, env);
  assert.match(active.stdout, /Bound BR-20260809-normalize/u);
  const stopped = await runHook("stop", { cwd: fx.root, session_id: "s", last_assistant_message: "done" }, env);
  assert.match(stopped.stdout, /"decision":"block"/u);
  assert.match(stopped.stdout, /BEFORE|open/u);
});

test("Claude failure and Codex PostToolUse shapes both record a signed BEFORE receipt", async () => {
  for (const variant of ["claude", "codex"]) {
    const fx = fixture();
    const env = { PLUGIN_DATA: fx.data, AI_EXPERTS_SESSION_ID: `${variant}-session` };
    await runHook("post", { cwd: fx.root, session_id: `${variant}-session`, tool_name: "Write", tool_input: { file_path: fx.path } }, env);
    const event = {
      cwd: fx.root,
      session_id: `${variant}-session`,
      tool_name: variant === "claude" ? "Bash" : "exec_command",
      tool_input: variant === "claude" ? { command: "node test/primary.mjs" } : { cmd: "node test/primary.mjs" },
      tool_response: variant === "claude" ? "PRIMARY_REPRO" : { exit_code: 1, output: "PRIMARY_REPRO" },
    };
    const result = await runHook(variant === "claude" ? "failure" : "post", event, env);
    assert.match(`${result.stdout}${result.stderr}`, /Receipt BR-R[0-9]+.*BR-C1 BEFORE/u);
  }
});

test("bound missing contract fails closed while paused contract releases Stop", async () => {
  const fx = fixture();
  const env = { PLUGIN_DATA: fx.data };
  await runHook("post", { cwd: fx.root, session_id: "s", tool_name: "Write", tool_input: { file_path: fx.path } }, env);
  writeFileSync(fx.path, "not json\n");
  const invalid = await runHook("stop", { cwd: fx.root, session_id: "s" }, env);
  assert.match(invalid.stdout, /"decision":"block"/u);

  const paused = regressionContract();
  paused.status = "paused";
  writeFileSync(fx.path, `${JSON.stringify(paused, null, 2)}\n`);
  await runHook("post", { cwd: fx.root, session_id: "s", tool_name: "Write", tool_input: { file_path: fx.path } }, env);
  const released = await runHook("stop", { cwd: fx.root, session_id: "s", last_assistant_message: paused.id }, env);
  assert.equal(released.stdout, "");
});

test("manifest hooks omit prompt and pre-tool interception and Codex commands carry provenance env", () => {
  const pluginRoot = fileURLToPath(new URL("..", import.meta.url));
  const claude = JSON.parse(execFileSync("cat", [join(pluginRoot, "hooks", "claude.json")], { encoding: "utf8" }));
  const codex = JSON.parse(execFileSync("cat", [join(pluginRoot, "hooks", "codex.json")], { encoding: "utf8" }));
  for (const manifest of [claude, codex]) {
    assert.equal("UserPromptSubmit" in manifest.hooks, false);
    assert.equal("PreToolUse" in manifest.hooks, false);
    for (const event of ["SessionStart", "PostToolUse", "Stop", "SubagentStop"]) assert.ok(event in manifest.hooks, event);
  }
  assert.ok("PostToolUseFailure" in claude.hooks);
  assert.equal("PostToolUseFailure" in codex.hooks, false);
  const commands = JSON.stringify(codex);
  assert.match(commands, /AI_EXPERTS_SESSION_ID/u);
  assert.match(commands, /AI_EXPERTS_TRIGGER_FROM/u);
});

test("timeouts and missing commands are not classified as behavioral failures", () => {
  assert.equal(commandObservation({ tool_response: { exit_code: 127, output: "tool: command not found" } }).outcome, "missing");
  assert.equal(commandObservation({ tool_response: { interrupted: true, output: "timeout exceeded" } }).outcome, "timeout");
});

test("Claude successful object responses without exit codes remain observable", () => {
  const prior = process.env.PLUGIN_ROOT;
  delete process.env.PLUGIN_ROOT;
  try {
    assert.equal(commandObservation({ tool_response: { stdout: "BOUNDARY_OK", stderr: "" } }).outcome, "success");
  } finally {
    if (prior === undefined) delete process.env.PLUGIN_ROOT;
    else process.env.PLUGIN_ROOT = prior;
  }
});

test("Codex canonical Bash hooks record literal-oracle receipts when exit status is unavailable", async () => {
  const fx = fixture();
  const env = {
    PLUGIN_DATA: fx.data,
    PLUGIN_ROOT: fileURLToPath(new URL("..", import.meta.url)),
    AI_EXPERTS_SESSION_ID: "codex-canonical-session",
  };
  await runHook("post", {
    cwd: fx.root,
    session_id: "codex-canonical-session",
    tool_name: "Write",
    tool_input: { file_path: fx.path },
    tool_response: "Done!",
  }, env);

  const result = await runHook("post", {
    cwd: fx.root,
    session_id: "codex-canonical-session",
    tool_name: "Bash",
    tool_input: { command: "node test/primary.mjs" },
    tool_response: "PRIMARY_REPRO legacy normalization is broken\n",
  }, env);

  assert.match(`${result.stdout}${result.stderr}`, /Receipt BR-R[0-9]+.*BR-C1 BEFORE/u);
  assert.match(`${result.stdout}${result.stderr}`, /literal-oracle/u);
});
