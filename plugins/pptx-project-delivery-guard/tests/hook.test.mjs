import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../scripts/pptx-project-delivery-guard.mjs", import.meta.url));

function runHook(mode, event) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], {
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
        command: "node /plugins/pptx-project-delivery-guard/scripts/tools/project-lint.mjs artifacts/pptx/demo && touch artifacts/pptx/demo/dist/forged.pptx",
      },
    });

    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /UNKNOWN_MUTATION_SHELL/u);
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

    const result = await runHook("stop", { cwd: root });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /PPTX Project Delivery Guard/u);
    assert.match(result.stderr, /REQUIRED_PATH_MISSING/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
