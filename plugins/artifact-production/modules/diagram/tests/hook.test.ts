import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readModuleRoutes } from "../../../../../core/tests/support/aio-routes.js";
import * as hookEntry from "../src/entries/hooks/diagram-production.js";

const ENTRY = fileURLToPath(new URL("../dist/hooks/diagram-production.mjs", import.meta.url));

test("hook entry imports without executing", () => { assert.ok(hookEntry); });

test("Claude and Codex owner routes register failure and stop enforcement", () => {
  for (const host of ["claude", "codex"] as const) {
    const routes = readModuleRoutes(import.meta.url, host, "diagram");
    assert.ok(routes.PreToolUse);
    assert.ok(routes.PostToolUseFailure);
    assert.ok(routes.Stop);
  }
});

function run(event: unknown) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, "pre"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject); child.on("close", (code) => resolve({ code, stdout, stderr })); child.stdin.end(JSON.stringify(event));
  });
}

test("pre hook denies a direct generated diagram write", async () => {
  const root = mkdtempSync(join(tmpdir(), "diagram-hook-"));
  try {
    const result = await run({ cwd: root, tool_name: "Write", tool_input: { file_path: "artifacts/diagram/flow/dist/flow.svg", content: "forged" } });
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
