import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../dist/hooks/logo-project-delivery-guard.mjs", import.meta.url));

test("Codex canonical hook discovery file matches the maintained codex hook manifest", () => {
  const canonical = readFileSync(fileURLToPath(new URL("../hooks/hooks.json", import.meta.url)), "utf8");
  const platform = readFileSync(fileURLToPath(new URL("../hooks/codex.json", import.meta.url)), "utf8");
  assert.deepEqual(JSON.parse(canonical), JSON.parse(platform));
});

function runHook(mode, event, raw = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(raw ?? JSON.stringify(event));
  });
}

test("pre hook denies a direct master SVG write", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-hook-"));
  try {
    const result = await runHook("pre", { cwd: root, tool_name: "Write", tool_input: { file_path: "artifacts/logo/orbit/build/master/mark.svg", content: "forged" } });
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const command of [
  "sed -i '' 's/a/b/' artifacts/logo/orbit/dist/primary/mark.svg",
  "sed -n 'w artifacts/logo/orbit/dist/primary/mark.svg' /dev/null",
  "dd if=/dev/null of=artifacts/logo/orbit/dist/primary/mark.svg",
  "find . -fprintf artifacts/logo/orbit/dist/primary/mark.svg forged",
  "perl -e 1 artifacts/logo/orbit/dist/primary/mark.svg",
  "rg --pre ./untrusted-helper needle artifacts/logo/orbit",
  "/tmp/untrusted/rg needle artifacts/logo/orbit",
  "git show --output=artifacts/logo/orbit/dist/primary/mark.svg HEAD:README.md",
]) test(`pre hook fails closed for scoped shell mutator: ${command.split(" ")[0]}`, async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-shell-"));
  try {
    const result = await runHook("pre", { cwd: root, tool_name: "Bash", tool_input: { command } });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre hook denies an opaque shell mutation whenever a logo project is active", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-opaque-shell-"));
  try {
    mkdirSync(join(root, "artifacts", "logo", "orbit"), { recursive: true });
    const command = `node -e "require('node:fs').writeFileSync(['arti','facts','logo','orbit','dist','primary','mark.svg'].join('/'),'forged')"`;
    const result = await runHook("pre", { cwd: root, tool_name: "Bash", tool_input: { command } });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre hook rejects a node eval command containing an approved wrapper substring", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-spoof-"));
  try {
    const wrapper = fileURLToPath(new URL("../dist/cli/project-release.mjs", import.meta.url));
    const command = `node -e "require('node:fs').writeFileSync(process.argv[1],'forged')" artifacts/logo/orbit/dist/primary/mark.svg ${wrapper}`;
    const result = await runHook("pre", { cwd: root, tool_name: "Bash", tool_input: { command } });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre hook allows only an exact registered render invocation for the project root", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-writer-allow-"));
  try {
    mkdirSync(join(root, "artifacts", "logo", "orbit"), { recursive: true });
    const wrapper = fileURLToPath(new URL("../dist/cli/project-render.mjs", import.meta.url));
    const result = await runHook("pre", { cwd: root, session_id: "hook-render-session", tool_name: "Bash", tool_input: { command: `node ${wrapper} artifacts/logo/orbit release` } });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre hook rejects the removed external strip-tool override", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-preview-override-"));
  try {
    mkdirSync(join(root, "artifacts", "logo", "orbit"), { recursive: true });
    const wrapper = fileURLToPath(new URL("../dist/cli/project-preview.mjs", import.meta.url));
    const command = `node ${wrapper} artifacts/logo/orbit --strip-tool /tmp/external-tool.mjs`;
    const result = await runHook("pre", { cwd: root, tool_name: "Bash", tool_input: { command } });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre hook denies a registered writer aimed through a symlink project root", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-writer-symlink-"));
  try {
    mkdirSync(join(root, "artifacts", "logo"), { recursive: true });
    mkdirSync(join(root, "outside"));
    symlinkSync(join(root, "outside"), join(root, "artifacts", "logo", "orbit"), "dir");
    const wrapper = fileURLToPath(new URL("../dist/cli/project-render.mjs", import.meta.url));
    const result = await runHook("pre", { cwd: root, tool_name: "Bash", tool_input: { command: `node ${wrapper} artifacts/logo/orbit release` } });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
    assert.match(result.stdout, /PROJECT_ROOT_UNREGISTERED/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("invalid hook JSON fails closed", async () => {
  const result = await runHook("pre", {}, "{not-json");
  assert.equal(result.code, 2);
  assert.match(result.stderr, /invalid hook JSON/u);
});

test("stop fails closed when a logo project is missing plan.contract.json", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-plan-"));
  try {
    mkdirSync(join(root, "artifacts", "logo", "orbit"), { recursive: true });
    const result = await runHook("stop", { cwd: root });
    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /PLAN_CONTRACT_MISSING/u);

    const retry = await runHook("stop", { cwd: root, stop_hook_active: true });
    assert.equal(retry.code, 0);
    assert.equal(retry.stdout, "");
    assert.equal(retry.stderr, "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre hook denies direct deletion or downgrade of an existing plan", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-plan-edit-"));
  const plan = join(root, "artifacts", "logo", "orbit", "plan.contract.json");
  try {
    mkdirSync(join(root, "artifacts", "logo", "orbit"), { recursive: true });
    writeFileSync(plan, JSON.stringify({ schema: "logo-project-delivery-guard/plan/v1", artifactId: "orbit", targetStage: "release" }));
    const result = await runHook("pre", { cwd: root, tool_name: "apply_patch", tool_input: { patch: "*** Begin Patch\n*** Delete File: artifacts/logo/orbit/plan.contract.json\n*** End Patch" } });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
    assert.match(result.stdout, /PLAN_STAGE_WRITER_REQUIRED/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre hook denies moving an existing plan through generic source and destination fields", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-plan-move-"));
  const project = join(root, "artifacts", "logo", "orbit");
  try {
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "plan.contract.json"), JSON.stringify({ schema: "logo-project-delivery-guard/plan/v1", artifactId: "orbit", targetStage: "release" }));
    const result = await runHook("pre", { cwd: root, tool_name: "MultiEdit", tool_input: { source_path: "artifacts/logo/orbit/plan.contract.json", destination_path: "artifacts/logo/orbit/plan.contract.bak" } });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
    assert.match(result.stdout, /PLAN_STAGE_WRITER_REQUIRED/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("stop does not silently ignore the thirty-third logo project", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-many-"));
  try {
    for (let index = 0; index < 33; index += 1) mkdirSync(join(root, "artifacts", "logo", `logo-${String(index).padStart(2, "0")}`), { recursive: true });
    const result = await runHook("stop", { cwd: root });
    assert.equal(result.code, 0);
    assert.match(JSON.parse(result.stdout).reason, /logo-32/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
