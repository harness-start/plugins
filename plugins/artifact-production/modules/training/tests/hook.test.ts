import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as hookEntry from "../src/entries/hooks/training-program-design.js";

const ENTRY = fileURLToPath(new URL("../dist/hooks/training-program-design.mjs", import.meta.url));

test("hook entry imports without executing", () => { assert.ok(hookEntry); });

function runHook(mode: string, event: Record<string, unknown>) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], {
      env: { ...process.env, AI_EXPERTS_SESSION_ID: "test-session", AI_EXPERTS_TRIGGER_FROM: `test:${mode}` },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "training-hook-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

test("pre hook denies direct writes to generated training materials", async () => {
  const root = workspace();
  try {
    const result = await runHook("pre", {
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: "artifacts/training/workflow-foundations/dist/facilitator-guide.md", content: "forged" },
    });
    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /PROTECTED_WRITER_REQUIRED/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre hook leaves source contracts editable", async () => {
  const root = workspace();
  try {
    const result = await runHook("pre", {
      cwd: root,
      tool_name: "apply_patch",
      tool_input: { patch: "*** Update File: artifacts/training/workflow-foundations/training-package.json" },
    });
    assert.deepEqual(result, { code: 0, stdout: "", stderr: "" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stop hook reports structured recovery and blocks an incomplete release", async () => {
  const root = workspace();
  try {
    const projectRoot = join(root, "artifacts", "training", "workflow-foundations");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, "plan.contract.json"), `${JSON.stringify({ artifactId: "workflow-foundations", targetStage: "release" })}\n`);
    const result = await runHook("stop", { cwd: projectRoot });
    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    for (const label of ["observedFacts:", "harm:", "unblockWhen:", "recovery:"]) assert.match(output.reason, new RegExp(label, "u"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("session hook advertises selective routing without activating a hard gate", async () => {
  const root = workspace();
  try {
    const result = await runHook("session", { cwd: root, session_id: "host-session" });
    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.match(output.hookSpecificOutput.additionalContext, /only when the user asks to design or adapt training/iu);
    assert.match(output.hookSpecificOutput.additionalContext, /no training project is active/iu);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("post hook does not flood a source-only project with future-stage findings", async () => {
  const root = workspace();
  try {
    const projectRoot = join(root, "artifacts", "training", "workflow-foundations");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, "plan.contract.json"), `${JSON.stringify({ artifactId: "workflow-foundations", targetStage: "release" })}\n`);
    writeFileSync(join(projectRoot, "training-package.json"), "{}\n");
    const result = await runHook("post", { cwd: root, tool_name: "Write" });
    assert.deepEqual(result, { code: 0, stdout: "", stderr: "" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
