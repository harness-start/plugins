import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ENTRY = fileURLToPath(new URL("../../../dist/hooks/ci-gated-delivery.mjs", import.meta.url));

function run(event: object): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, "pre"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

test("hook entry stays silent for SessionStart-shaped input", async () => {
  const result = await run({ hook_event_name: "SessionStart", cwd: process.cwd(), session_id: "session-1" });
  assert.deepEqual(result, { code: 0, stdout: "", stderr: "" });
});

test("hook entry enforces SHA binding for an observed default-branch push", async () => {
  const result = await run({ cwd: process.cwd(), tool_name: "exec_command", tool_input: { cmd: "git push origin main" } });
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /PUSH_SHA_REQUIRED/u);
});
