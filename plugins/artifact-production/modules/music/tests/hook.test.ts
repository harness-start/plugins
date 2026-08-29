import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { consumeMusicWriterCapability } from "../src/lib/capability.js";
import * as hookEntry from "../src/entries/hooks/music-production.js";
import { evaluateMusicShell } from "../src/lib/shell-policy.js";

const ENTRY = fileURLToPath(new URL("../dist/hooks/music-production.mjs", import.meta.url));
const RENDER_ENTRY = fileURLToPath(new URL("../dist/cli/project-render.mjs", import.meta.url));
const REFERENCE_ENTRY = fileURLToPath(new URL("../dist/cli/project-reference.mjs", import.meta.url));
const INIT_ENTRY = fileURLToPath(new URL("../dist/cli/project-init.mjs", import.meta.url));

test("hook entry imports without executing", () => { assert.ok(hookEntry); });

async function runPre(command, cwd = process.cwd(), env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, "pre"], { stdio: ["pipe", "pipe", "pipe"], env });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
    child.stdin.end(JSON.stringify({ cwd, tool_name: "Bash", tool_input: { command } }));
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
  const result = await runPre("node -e \"require('fs').writeFileSync('artifacts/music/study/dist/forged.wav','x')\" plugins/music-production/dist/cli/project-render.mjs artifacts/music/study");
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("denies unregistered in-place shell writers in music scope", async () => {
  const result = await runPre("sed -i s/a/b/ artifacts/music/study/build/score.dead.json");
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("allows an unrelated repo-root interpreter when a music project exists", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "music-hook-unrelated-"));
  await mkdir(join(cwd, "artifacts", "music", "study"), { recursive: true });
  assert.deepEqual(evaluateMusicShell({
    command: "node --input-type=module -e 'console.log(1)'",
    cwd,
    workspaceRoot: cwd,
    toolDirectory: join(cwd, "dist", "cli"),
    activeProjectCount: 1,
  }), { decision: "outside" });
  const result = await runPre("node --input-type=module -e 'console.log(1)'", cwd);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
});

test("issues a one-shot capability only for an exact registered writer command", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "music-hook-capability-"));
  const root = join(cwd, "artifacts", "music", "study");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "music.project.json"), JSON.stringify({ schema: "music-production/project/v1", artifactId: "study", tracks: [] }));
  const command = `node "${RENDER_ENTRY}" "${root}"`;
  const result = await runPre(command, cwd, { ...process.env, AI_EXPERTS_SESSION_ID: "hook-test-session", AI_EXPERTS_TRIGGER_FROM: "test:pre" });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  const grant = await consumeMusicWriterCapability({ root, capability: "music-render", argv: [RENDER_ENTRY, root] });
  assert.equal(grant.sessionId, "hook-test-session");

  const compound = await runPre(`${command} && printf bad`, cwd, { ...process.env, AI_EXPERTS_SESSION_ID: "hook-test-session" });
  assert.equal(JSON.parse(compound.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("issues a bootstrap capability for the exact project initializer", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "music-hook-init-"));
  const root = join(cwd, "artifacts", "music", "new-study");
  const command = `node "${INIT_ENTRY}" "${root}" --skip-install`;
  const result = await runPre(command, cwd, { ...process.env, AI_EXPERTS_SESSION_ID: "init-hook-session", AI_EXPERTS_TRIGGER_FROM: "test:pre" });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  const grant = await consumeMusicWriterCapability({ root, capability: "music-init", argv: [INIT_ENTRY, root, "--skip-install"] });
  assert.equal(grant.sessionId, "init-hook-session");
});

test("issues a reference capability only for the exact two-input writer command", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "music-hook-reference-"));
  const root = join(cwd, "artifacts", "music", "study");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "music.project.json"), JSON.stringify({ schema: "music-production/project/v1", artifactId: "study", tracks: [] }));
  const sources = join(cwd, "sources.json");
  const profile = join(cwd, "profile.json");
  const command = `node "${REFERENCE_ENTRY}" "${root}" "${sources}" "${profile}"`;
  const result = await runPre(command, cwd, { ...process.env, AI_EXPERTS_SESSION_ID: "reference-hook-session", AI_EXPERTS_TRIGGER_FROM: "test:pre" });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  const grant = await consumeMusicWriterCapability({ root, capability: "music-reference", argv: [REFERENCE_ENTRY, root, sources, profile] });
  assert.equal(grant.sessionId, "reference-hook-session");
});

test("allows a recursive Stop after the first contract block to prevent a host loop", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "tonejs-stop-loop-"));
  const project = join(cwd, "artifacts", "music", "demo");
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "plan.contract.json"), JSON.stringify({ schema: "music-production/plan/v1", artifactId: "demo", targetStage: "release" }));
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

test("denies source edits after the project advances to release", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "music-release-lock-"));
  const project = join(cwd, "artifacts", "music", "demo");
  await mkdir(join(project, "src"), { recursive: true });
  await writeFile(join(project, "plan.contract.json"), JSON.stringify({ schema: "music-production/plan/v1", artifactId: "demo", targetStage: "release" }));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, "pre"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
    child.stdin.end(JSON.stringify({ cwd, tool_name: "Write", tool_input: { file_path: join(project, "src", "composition.mjs"), content: "changed" } }));
  });
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.match(result.stdout, /RELEASE_STAGE_LOCKED/u);
});

test("denies direction edits while source analysis lacks a current reference profile", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "music-reference-gate-"));
  const project = join(cwd, "artifacts", "music", "demo");
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "plan.brief.json"), JSON.stringify({
    schema: "music-production/brief/v2",
    artifactId: "demo",
    reference: { mode: "source-analysis", sourceSetSha256: "a".repeat(64) },
  }));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, "pre"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
    child.stdin.end(JSON.stringify({ cwd, tool_name: "Write", tool_input: { file_path: join(project, "plan.direction.json"), content: "{}" } }));
  });
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.match(result.stdout, /REFERENCE_PROFILE_REQUIRED/u);
});
