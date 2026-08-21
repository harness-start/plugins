import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../../../dist/hooks/test-driven-development.mjs", import.meta.url));

function runRawHook(mode, input, platform = "codex") {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode, platform], {
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

test("SessionStart injects the mechanical test-first file-order rule", async () => {
  const result = await runHook("session-start", { cwd: process.cwd(), session_id: "session-1" });
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
  assert.equal(output.hookSpecificOutput.permissionDecision, undefined);
  const context = output.hookSpecificOutput.additionalContext;
  assert.match(context, /\[TDD Guard\]/u);
  assert.match(context, /git HEAD/iu);
  assert.match(context, /corresponding test/iu);
  assert.match(context, /before changing implementation/iu);
  assert.match(context, /cannot mix test and (?:implementation|source)/iu);
  assert.match(context, /separate tool call/iu);
  assert.match(context, /dirty test.*later implementation/iu);
  assert.match(context, /does not run tests/iu);
  assert.match(context, /does not.*RED\/GREEN/iu);
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
  assert.match(output.hookSpecificOutput.additionalContext, /\[TDD Guard\]/u);
});
