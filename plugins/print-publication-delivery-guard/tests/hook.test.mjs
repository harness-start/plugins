import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../scripts/print-publication-delivery-guard.mjs", import.meta.url));

test("pre hook denies a direct print PDF write", async () => {
  const root = mkdtempSync(join(tmpdir(), "print-hook-"));
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [ENTRY, "pre"], { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout }));
      child.stdin.end(JSON.stringify({ cwd: root, tool_name: "Write", tool_input: { file_path: "artifacts/print/manual/dist/manual.interior.print.pdf", content: "forged" } }));
    });

    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
