import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TSX = fileURLToPath(new URL("../../../../../../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const CLI = fileURLToPath(new URL("../../../../../src/entries/cli/harness.ts", import.meta.url));

test("public logs sanitize command redacts credential-shaped runtime output", async () => {
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [TSX, CLI, "logs", "sanitize"], {
      env: { ...process.env, PLUGIN_ROOT: fileURLToPath(new URL("../../../../../", import.meta.url)) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end("password: fixture-secret\nAuthorization: Bearer fixture-token\n");
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.includes("fixture-secret"), false);
  assert.equal(result.stdout.includes("fixture-token"), false);
  assert.match(result.stdout, /\[REDACTED\]/u);
});
