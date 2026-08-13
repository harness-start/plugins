import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { main as hookMain } from "./subagent-workflow-guard.mjs";

function runStart(event) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("./subagent-workflow-guard.mjs", import.meta.url)), "start", "codex"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
    child.stdin.end(JSON.stringify(event));
  });
}

test("SubagentStart public entry remains callable without a governed run", async () => {
  const result = await runStart({
    hook_event_name: "SubagentStart",
    session_id: "entry-test",
    cwd: mkdtempSync(`${tmpdir()}/swg-entry-`),
    agent_id: "child",
  });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Subagent Contract/u);
});

test("hook module loads through its exact public entry", async () => {
  assert.equal(typeof hookMain, "function");
});
