import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../scripts/artifact-evidence-guard.mjs", import.meta.url));

function runStop(event) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, "stop"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

test("ordinary completion without artifact evidence is a no-op", async () => {
  const result = await runStop({ cwd: process.cwd(), last_assistant_message: "Tests passed." });

  assert.deepEqual(result, { code: 0, stdout: "", stderr: "" });
});

test("well-formed artifact evidence with a digest mismatch blocks Stop", async (context) => {
  const workspace = mkdtempSync(join(tmpdir(), "artifact-evidence-guard-"));
  context.after(() => rmSync(workspace, { recursive: true, force: true }));
  writeFileSync(join(workspace, "result.txt"), "ok\n");
  const message = [
    "```artifact-evidence",
    JSON.stringify({
      schema: "artifact-evidence/v1",
      artifacts: [{ path: "result.txt", bytes: 3, sha256: "0".repeat(64), format: "text" }],
    }),
    "```",
  ].join("\n");

  const result = await runStop({ cwd: workspace, last_assistant_message: message });

  assert.equal(result.code, 0);
  assert.match(JSON.parse(result.stdout).reason, /sha256 does not match/u);
});
