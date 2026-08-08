import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

function readJson(relativePath) {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

const REQUIRED_HOOKS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "SubagentStart",
  "SubagentStop",
  "Stop",
];

const ENTRY = fileURLToPath(
  new URL("../scripts/subagent-workflow-guard.mjs", import.meta.url),
);
const ACCEPT_EXPECT = fileURLToPath(
  new URL("../acceptance/cases/01-application-dispatch/expect.sh", import.meta.url),
);
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

function runHook(mode, host, input, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode, host], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}

function runClaudeExpect({ narrationOnly = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "swg-claude-expect-"));
  const workspace = join(root, "workspace");
  const projects = join(root, "home", ".claude", "projects", "fixture");
  mkdirSync(workspace, { recursive: true });
  mkdirSync(projects, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: workspace, encoding: "utf8" });
  writeFileSync(join(root, "host.log"), [
    "model: deepseek-v4-flash",
    "assistant: [subagent-workflow-guard] DENY run=acceptance-run tool=agent-1 reason=missing-application",
    "",
  ].join("\n"));

  if (!narrationOnly) {
    writeFileSync(join(root, "host.claude-debug.log"), [
      "Hook PreToolUse:Agent (PreToolUse) success:",
      JSON.stringify({ hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "[subagent-workflow-guard] DENY run=acceptance-run tool=agent-1 reason=missing-application",
      } }),
      "",
    ].join("\n"));
    writeFileSync(join(projects, "session.jsonl"), [
      JSON.stringify({ type: "assistant", message: { content: [
        { type: "tool_use", id: "agent-1", name: "Agent", input: {} },
      ] } }),
      JSON.stringify({ type: "user", message: { content: [
        { type: "tool_result", tool_use_id: "agent-1", is_error: true, content: "reason=missing-application" },
      ] } }),
      "",
    ].join("\n"));
  }

  return spawnSync("bash", [ACCEPT_EXPECT], {
    encoding: "utf8",
    env: {
      ...process.env,
      ACCEPT_REPO: REPO_ROOT,
      ACCEPT_HOST: "claude",
      ACCEPT_OUT: root,
      ACCEPT_LOG: join(root, "host.log"),
      ACCEPT_WORKSPACE: workspace,
    },
  });
}

for (const host of ["claude", "codex"]) {
  test(`${host} manifest exposes the complete governed workflow`, () => {
    const manifest = readJson(`../hooks/${host}.json`);
    const eventNames = Object.keys(manifest.hooks);
    assert.deepEqual(
      REQUIRED_HOOKS.filter((name) => !eventNames.includes(name)),
      [],
    );
    if (host === "claude") assert.ok(eventNames.includes("PostToolUseFailure"));
  });
}

test("SessionStart publishes the application-first workflow contract", async () => {
  const result = await runHook("session", "codex", {
    hook_event_name: "SessionStart",
    session_id: "session-1",
  });
  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(output.hookSpecificOutput.additionalContext, /application/i);
  assert.match(output.hookSpecificOutput.additionalContext, /Result Card/);
});

test("Claude SessionStart persists the exact hook session for workflow CLI commands", async () => {
  const directory = mkdtempSync(join(tmpdir(), "swg-claude-env-"));
  const environmentFile = join(directory, "session-env.sh");
  writeFileSync(environmentFile, "");
  const result = await runHook("session", "claude", {
    hook_event_name: "SessionStart",
    session_id: "claude-session-1",
  }, { CLAUDE_ENV_FILE: environmentFile, CLAUDE_PLUGIN_ROOT: "/installed/subagent-workflow-guard" });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(readFileSync(environmentFile, "utf8"), [
    "export AI_EXPERTS_SESSION_ID='claude-session-1'",
    "export SUBAGENT_WORKFLOW_GUARD_HOST='claude'",
    "export SUBAGENT_WORKFLOW_GUARD_ROOT='/installed/subagent-workflow-guard'",
    "",
  ].join("\n"));
});

test("local catalogs expose only the renamed workflow guard", () => {
  for (const relative of ["../../../.claude-plugin/marketplace.json", "../../../.agents/plugins/marketplace.json"]) {
    const catalog = readJson(relative);
    const names = catalog.plugins.map((plugin) => plugin.name);
    assert.ok(names.includes("subagent-workflow-guard"));
    assert.ok(!names.includes("subagent-discipline"));
  }
  const installer = readFileSync(fileURLToPath(new URL("../../../scripts/install-all.sh", import.meta.url)), "utf8");
  assert.match(installer, /subagent-workflow-guard/u);
  assert.doesNotMatch(installer, /subagent-discipline/u);
});

test("Claude acceptance requires a structured Agent deny receipt", () => {
  const narration = runClaudeExpect({ narrationOnly: true });
  assert.notEqual(narration.status, 0, "assistant narration must not satisfy the hook receipt assertion");

  const structured = runClaudeExpect();
  assert.equal(structured.status, 0, structured.stderr);
});
