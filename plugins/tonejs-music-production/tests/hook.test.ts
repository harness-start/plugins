import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../dist/hooks/tonejs-music-production.mjs", import.meta.url));

async function runPre(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, "pre"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
    child.stdin.end(JSON.stringify({ cwd: process.cwd(), tool_name: "Bash", tool_input: { command } }));
  });
}

test("pre hook denies a direct symbolic score write", async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, "pre"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
    child.stdin.end(JSON.stringify({
      cwd: process.cwd(),
      tool_name: "Write",
      tool_input: { file_path: "artifacts/music/study/build/score.forged.json", content: "{}" },
    }));
  });

  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("denies a shell payload that merely smuggles a registered wrapper path as an argument", async () => {
  const result = await runPre("node -e \"require('fs').writeFileSync('artifacts/music/study/dist/forged.wav','x')\" plugins/tonejs-music-production/dist/cli/project-render.mjs artifacts/music/study");
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("denies unregistered in-place shell writers in music scope", async () => {
  const result = await runPre("sed -i s/a/b/ artifacts/music/study/build/score.dead.json");
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("allows a recursive Stop after the first contract block to prevent a host loop", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "tonejs-stop-loop-"));
  const project = join(cwd, "artifacts", "music", "demo");
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "plan.contract.json"), JSON.stringify({ schema: "tonejs-music-plan/v1", targetStage: "release" }));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, "stop"], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.end(JSON.stringify({ cwd, stop_hook_active: true }));
  });
  assert.deepEqual(result, { code: 0, stderr: "" });
});
