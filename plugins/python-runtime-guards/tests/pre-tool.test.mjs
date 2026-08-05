import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  collectLockfileTargets,
  lockfileDenyMessage,
  isDependencyLockfile,
} from "../scripts/checks/lockfile.mjs";

const PRE = fileURLToPath(new URL("../scripts/python-hook-pre-tool.mjs", import.meta.url));
const LOCK = "poetry.lock";

test("lockfile name recognized", () => {
  assert.equal(isDependencyLockfile(LOCK), true);
  assert.equal(isDependencyLockfile("README.md"), false);
});

test("Write lockfile is denied by collector", () => {
  const hits = collectLockfileTargets({
    toolName: "Write",
    input: { file_path: `/repo/${LOCK}` },
  });
  assert.deepEqual(hits, [`/repo/${LOCK}`]);
});

test("apply_patch lowercase lockfile is denied by collector", () => {
  const hits = collectLockfileTargets({
    toolName: "apply_patch",
    input: {
      patch: ["*** Begin Patch", `*** Add File: ${LOCK}`, "@@", "+x"].join("\n"),
    },
  });
  assert.ok(hits.some((h) => h.endsWith(LOCK)));
});

test("deny message has blockingContract", () => {
  const msg = lockfileDenyMessage([LOCK]);
  assert.match(msg, /Lockfile Guard/);
  assert.match(msg, /blockingContract/);
  assert.match(msg, /observedFacts/);
});

function runHook(script, event) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
    child.stdin.end(JSON.stringify(event));
  });
}

test("entry: Write lockfile yields deny JSON", async () => {
  const { code, stdout } = await runHook(PRE, {
    tool_name: "Write",
    tool_input: { file_path: LOCK, content: "x" },
  });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /Lockfile Guard/);
});

test("entry: clean source write yields empty stdout", async () => {
  const { code, stdout } = await runHook(PRE, {
    tool_name: "Write",
    tool_input: { file_path: `src/main.py`, content: "ok\n" },
  });
  assert.equal(code, 0);
  assert.equal(stdout, "");
});
