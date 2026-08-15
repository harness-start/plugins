import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../dist/hooks/video-project-delivery-guard.mjs", import.meta.url));

function runHook(mode, event) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

test("pre hook denies a direct final MP4 write", async () => {
  const root = mkdtempSync(join(tmpdir(), "video-hook-"));
  try {
    const result = await runHook("pre", { cwd: root, tool_name: "Write", tool_input: { file_path: "artifacts/video/launch/dist/launch.mp4", content: "forged" } });

    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pre hook denies a protected file write from the artifact cwd", async () => {
  const root = mkdtempSync(join(tmpdir(), "video-hook-nested-"));
  const project = join(root, "artifacts", "video", "launch");
  try {
    mkdirSync(project, { recursive: true });
    const result = await runHook("pre", { cwd: project, tool_name: "Write", tool_input: { file_path: "dist/launch.mp4", content: "forged" } });

    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const command of [
  "dd if=/dev/null of=artifacts/video/launch/dist/launch.mp4",
  "perl -e 1 artifacts/video/launch/dist/launch.mp4",
]) {
  test(`pre hook fails closed for scoped shell command: ${command.split(" ")[0]}`, async () => {
    const root = mkdtempSync(join(tmpdir(), "video-hook-shell-"));
    try {
      const result = await runHook("pre", { cwd: root, tool_name: "Bash", tool_input: { command } });

      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("pre hook rejects a node eval command containing an approved wrapper substring", async () => {
  const root = mkdtempSync(join(tmpdir(), "video-hook-spoof-"));
  try {
    const command = `node -e "0" ${fileURLToPath(new URL("../dist/cli/project-release.mjs", import.meta.url))} artifacts/video/launch/dist/launch.mp4`;
    const result = await runHook("pre", { cwd: root, tool_name: "Bash", tool_input: { command } });

    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stop fails closed when an artifact directory is missing plan.contract.json", async () => {
  const root = mkdtempSync(join(tmpdir(), "video-hook-plan-"));
  try {
    mkdirSync(join(root, "artifacts", "video", "launch"), { recursive: true });
    const result = await runHook("stop", { cwd: root });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /PLAN_CONTRACT_MISSING/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
