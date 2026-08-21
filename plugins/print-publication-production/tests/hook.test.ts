import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../dist/hooks/print-publication-production.mjs", import.meta.url));

async function runPreHook(event) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, "pre"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
    child.stdin.end(JSON.stringify(event));
  });
}

test("Codex manifest registers the bundled publication hooks", () => {
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../.codex-plugin/plugin.json", import.meta.url)), "utf8"));
  assert.equal(manifest.hooks, "./hooks/codex.json");
});

test("pre hook denies a direct print PDF write", async () => {
  const root = mkdtempSync(join(tmpdir(), "print-hook-"));
  try {
    const result = await runPreHook({ cwd: root, tool_name: "Write", tool_input: { file_path: "artifacts/print/manual/dist/manual.interior.print.pdf", content: "forged" } });

    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre hook denies unregistered shell mutators in print scope", async () => {
  const root = mkdtempSync(join(tmpdir(), "print-hook-"));
  try {
    const result = await runPreHook({
      cwd: root,
      tool_name: "exec_command",
      tool_input: { cmd: "sed -i s/old/new/ artifacts/print/manual/dist/manual.interior.print.pdf" },
    });

    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
