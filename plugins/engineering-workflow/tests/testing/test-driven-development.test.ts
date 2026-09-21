import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as hookEntry from "../../src/domains/testing/hook.js";

const ENTRY = fileURLToPath(new URL("../../dist/hooks/dispatcher.mjs", import.meta.url));

function runHook(event, platform = "codex") {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, platform, "PreToolUse"], {
      env: { ...process.env, PLUGIN_ROOT: fileURLToPath(new URL("../..", import.meta.url)) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

test("TDD method owns RED and GREEN while the Hook stays advisory", () => {
  const skill = readFileSync(fileURLToPath(new URL("../../skills/tdd-red-green/SKILL.md", import.meta.url)), "utf8");
  assert.match(skill, /same focused test command/iu);
  assert.match(skill, /engineering-verification.*broader verification/isu);
  assert.match(skill, /Hook.*does not enforce.*file order/isu);
  assert.doesNotMatch(skill, /Hook enforces file order/iu);
});

test("hook entry imports without executing", () => { assert.ok(hookEntry); });

test("public PreToolUse never blocks ordinary implementation workflows", async () => {
  const cwd = process.cwd();
  const events = [
    {
      cwd,
      session_id: "soft-source-first",
      tool_name: "Write",
      tool_input: { file_path: `${cwd}/src/service.ts`, content: "export const value = 1;\n" },
    },
    {
      cwd,
      session_id: "soft-mixed-patch",
      tool_name: "apply_patch",
      tool_input: {
        patch: [
          "*** Add File: test/service.test.ts",
          "+test('value', () => {});",
          "*** Add File: src/service.ts",
          "+export const value = 1;",
        ].join("\n"),
      },
    },
    {
      cwd,
      session_id: "soft-opaque-write",
      tool_name: "exec_command",
      tool_input: { cmd: "python -c 'from pathlib import Path; Path(\"src/service.ts\").write_text(\"x\")'" },
    },
  ];

  for (const platform of ["claude", "codex"]) {
    for (const event of events) {
      const result = await runHook(event, platform);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.stdout, "", `${platform}: ${result.stdout}\n${result.stderr}`);
      assert.doesNotMatch(result.stderr, /\[TDD Guard\].*Blocked/iu);
    }
  }
});
