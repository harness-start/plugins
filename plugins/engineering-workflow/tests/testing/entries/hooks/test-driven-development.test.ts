import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../../../../dist/hooks/dispatcher.mjs", import.meta.url));

function runRawHook(mode, input, platform = "codex") {
  return new Promise((resolvePromise, reject) => {
    const eventName = mode === "session-start" ? "SessionStart" : "PreToolUse";
    const child = spawn(process.execPath, [ENTRY, platform, eventName], {
      env: { ...process.env, PLUGIN_ROOT: fileURLToPath(new URL("../../../..", import.meta.url)) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

function runHook(mode, event, platform = "codex") {
  return runRawHook(mode, JSON.stringify(event), platform);
}

test("SessionStart offers a non-blocking TDD method reminder", async () => {
  const result = await runHook("session-start", { cwd: process.cwd(), session_id: "session-1" });
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
  assert.equal(output.hookSpecificOutput.permissionDecision, undefined);
  const context = output.hookSpecificOutput.additionalContext;
  assert.match(context, /\[TDD Method\]/u);
  assert.match(context, /advisory/iu);
  assert.match(context, /does not enforce.*file order/iu);
  assert.match(context, /run.*RED.*GREEN/isu);
  assert.match(context, /tdd-red-green/u);
  assert.match(context, /not a hook prerequisite/iu);
});

test("SessionStart malformed input fails open", async () => {
  const result = await runRawHook("session-start", "{not-json");
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.doesNotMatch(result.stderr, /Blocked |permissionDecision/u);
});

test("SessionStart stays advisory when the event looks like a source write", async () => {
  const result = await runHook("session-start", {
    cwd: process.cwd(),
    session_id: "session-1",
    tool_name: "Write",
    tool_input: { file_path: "src/Service/OrderService.php", content: "<?php class OrderService {}" },
  });
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
  assert.equal(output.hookSpecificOutput.permissionDecision, undefined);
  assert.match(output.hookSpecificOutput.additionalContext, /\[TDD Method\]/u);
});
