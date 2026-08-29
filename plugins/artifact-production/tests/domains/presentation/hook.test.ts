import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { releaseModel, writeModel } from "./fixture.js";
import * as hookEntry from "../../../src/domains/presentation/entries/hooks/presentation-production.js";

const ENTRY = fileURLToPath(new URL("../../../dist/hooks/dispatcher.mjs", import.meta.url));
const RENDER_ENTRY = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));

test("hook entry imports without executing", () => { assert.ok(hookEntry); });

function runHook(mode, event) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, "codex", ({ "session-start": "SessionStart", pre: "PreToolUse", post: "PostToolUse", failure: "PostToolUseFailure", stop: "Stop", session: "SessionStart", prompt: "UserPromptSubmit", "user-prompt": "UserPromptSubmit", subagent: "SubagentStart", "subagent-stop": "SubagentStop" } as Record<string, string>)[mode] ?? mode], {
      env: {
        ...process.env,
        AI_EXPERTS_SESSION_ID: "test-session",
        AI_EXPERTS_TRIGGER_FROM: `test:${mode}`,
      },
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
  const root = mkdtempSync(join(tmpdir(), "pptx-hook-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

test("pre hook denies a direct PPTX dist write", async () => {
  const root = workspace();
  try {
    const result = await runHook("pre", {
      cwd: root,
      tool_name: "Write",
      tool_input: {
        file_path: "artifacts/pptx/quarterly-review/dist/quarterly-review.pptx",
        content: "forged",
      },
    });

    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /PROTECTED_WRITER_REQUIRED/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre hook allows an ordinary slide source write", async () => {
  const root = workspace();
  try {
    const result = await runHook("pre", {
      cwd: root,
      tool_name: "apply_patch",
      tool_input: {
        patch: "*** Update File: artifacts/pptx/quarterly-review/src/slides/001-opening.ts",
      },
    });

    assert.deepEqual(result, { code: 0, stdout: "", stderr: "" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre hook rejects a registered wrapper chained with a second writer", async () => {
  const root = workspace();
  try {
    const result = await runHook("pre", {
      cwd: root,
      tool_name: "Bash",
      tool_input: {
        command: "node /plugins/artifact-production/dist/cli/harness.mjs presentation lint artifacts/pptx/demo && touch artifacts/pptx/demo/dist/forged.pptx",
      },
    });

    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /UNKNOWN_MUTATION_SHELL/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre hook issues an argv- and session-bound capability for the exact render wrapper", async () => {
  const root = workspace();
  try {
    const projectRoot = join(root, "artifacts", "pptx", "deck");
    mkdirSync(projectRoot, { recursive: true });
    writeModel(projectRoot, releaseModel());

    const result = await runHook("pre", {
      cwd: root,
      session_id: "host-session",
      tool_name: "exec_command",
      tool_input: { cmd: `node ${RENDER_ENTRY} presentation render ${projectRoot}` },
    });

    assert.deepEqual(result, { code: 0, stdout: "", stderr: "" });
    const grant = JSON.parse(readFileSync(join(projectRoot, ".tmp", "pptx-guard", "capability.pptx-render.json"), "utf8"));
    assert.equal(grant.capability, "pptx-render");
    assert.equal(grant.sessionId, "host-session");
    assert.equal(grant.root, realpathSync(projectRoot));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stop hook blocks an incomplete project that targets release", async () => {
  const root = workspace();
  try {
    const projectRoot = join(root, "artifacts", "pptx", "quarterly-review");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(
      join(projectRoot, "plan.contract.json"),
      JSON.stringify({ artifactId: "quarterly-review", targetStage: "release" }),
    );

    const result = await runHook("stop", { cwd: projectRoot });

    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /PPTX Project Delivery Guard/u);
    assert.match(output.reason, /REQUIRED_PATH_MISSING/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("subagent stop closes at review while main stop still requires release", async () => {
  const root = workspace();
  try {
    const projectRoot = join(root, "artifacts", "pptx", "deck");
    mkdirSync(projectRoot, { recursive: true });
    writeModel(projectRoot, releaseModel());
    unlinkSync(join(projectRoot, "release.manifest.json"));
    unlinkSync(join(projectRoot, "receipt.release.json"));

    const reviewerStop = await runHook("subagent-stop", { cwd: root });
    assert.deepEqual(reviewerStop, { code: 0, stdout: "", stderr: "" });

    const mainStop = await runHook("stop", { cwd: projectRoot });
    const output = JSON.parse(mainStop.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /RELEASE_MANIFEST_INVALID|RECEIPT_INVALID/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
