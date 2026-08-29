import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readModuleRoutes } from "../../../../../core/tests/support/aio-routes.js";
import * as hookEntry from "../src/entries/hooks/print-publication-production.js";

const ENTRY = fileURLToPath(new URL("../dist/hooks/print-publication-production.mjs", import.meta.url));

test("hook entry imports without executing", () => { assert.ok(hookEntry); });

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

test("Codex owner routes register the bundled publication hooks", () => {
  assert.ok(Object.keys(readModuleRoutes(import.meta.url, "codex", "print")).length > 0);
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

test("pre hook allows an unrelated repo-root interpreter when a print project exists", async () => {
  const root = mkdtempSync(join(tmpdir(), "print-hook-unrelated-"));
  try {
    const project = join(root, "artifacts", "print", "manual");
    mkdirSync(project, { recursive: true });
    const result = await runPreHook({
      cwd: root,
      tool_name: "exec_command",
      tool_input: { cmd: "node --input-type=module -e 'console.log(1)'" },
    });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
