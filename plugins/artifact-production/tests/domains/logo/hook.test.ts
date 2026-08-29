import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readModuleRoutes } from "../../../../../core/tests/support/aio-routes.js";
import * as hookEntry from "../../../src/domains/logo/entries/hooks/brand-logo-production.js";
import { computeLogoSubjectDigest } from "../../../src/domains/logo/lib/contract.js";
import { loadLogoProject } from "../../../src/domains/logo/lib/project.js";
import { validLogoModel, writeModel } from "./helpers/logo-fixture.js";

const ENTRY = fileURLToPath(new URL("../../../dist/hooks/dispatcher.mjs", import.meta.url));

test("hook entry imports without executing", () => { assert.ok(hookEntry); });

test("owner routes keep logo Hook behavior platform-scoped", () => {
  const claude = readModuleRoutes(import.meta.url, "claude", "logo");
  const expectedModes = new Map([
    ["SessionStart", "session"],
    ["SubagentStart", "subagent"],
    ["PreToolUse", "pre"],
    ["PostToolUse", "post"],
    ["PostToolUseFailure", "failure"],
    ["Stop", "stop"],
  ]);
  for (const [event, mode] of expectedModes) {
    const routes = claude[event];
    assert.equal(routes.length, 1, `${event} must have one module route`);
    assert.equal(routes[0].handler, "logo:brand-logo-production");
    assert.deepEqual(routes[0].args, [mode]);
    assert.equal(routes[0].timeoutMs, 10_000);
  }
  assert.equal(Object.hasOwn(claude, "SubagentStop"), false, "review subagents must be able to return evidence before main-session closure");
  const codex = readModuleRoutes(import.meta.url, "codex", "logo");
  assert.equal(Object.hasOwn(codex, "SubagentStop"), false, "Codex review subagents must not inherit main-session closure");
});

test("Claude review subagents receive and use an agent-scoped reviewer identity", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-review-agent-"));
  const project = join(root, "artifacts", "logo", "orbit-logo");
  const input = join(root, "review.json");
  try {
    const model = validLogoModel();
    delete model.files["review.logo.json"];
    delete model.files["release.manifest.json"];
    delete model.files["receipt.release.json"];
    await writeModel(project, model);
    const loaded = await loadLogoProject(project);
    const subjectDigest = computeLogoSubjectDigest(loaded);

    const started = await runHook("subagent", { cwd: root, session_id: "parent-session", agent_id: "review-agent", agent_type: "general-purpose" }, null, process.env, "claude");
    assert.equal(started.code, 0, started.stderr);
    assert.match(JSON.parse(started.stdout).hookSpecificOutput.additionalContext, /parent-session:agent:review-agent/u);

    const wrapper = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));
    const command = `node ${wrapper} logo review ${project} ${input}`;
    const allowed = await runHook("pre", { cwd: root, session_id: "parent-session", agent_id: "review-agent", agent_type: "general-purpose", tool_name: "Bash", tool_input: { command } });
    assert.equal(allowed.code, 0, allowed.stderr);
    assert.equal(allowed.stdout, "");
    const grant = JSON.parse(readFileSync(join(project, ".tmp", "logo-guard", "capability.logo-review.json"), "utf8"));
    assert.equal(grant.subjectDigest, subjectDigest);
    assert.equal(grant.sessionId, "parent-session:agent:review-agent");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function runHook(mode, event, raw = null, env = process.env, host = "codex") {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, host, ({ "session-start": "SessionStart", pre: "PreToolUse", post: "PostToolUse", failure: "PostToolUseFailure", stop: "Stop", session: "SessionStart", prompt: "UserPromptSubmit", "user-prompt": "UserPromptSubmit", subagent: "SubagentStart", "subagent-stop": "SubagentStop" } as Record<string, string>)[mode] ?? mode], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(raw ?? JSON.stringify(event));
  });
}

test("Codex pre hook binds a review grant to the child thread instead of the parent event session", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-review-codex-agent-"));
  const project = join(root, "artifacts", "logo", "orbit-logo");
  const input = join(root, "review.json");
  const codexHome = join(root, "codex-home");
  try {
    const model = validLogoModel();
    delete model.files["review.logo.json"];
    delete model.files["release.manifest.json"];
    delete model.files["receipt.release.json"];
    await writeModel(project, model);
    const wrapper = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));
    const command = `node ${wrapper} logo review ${project} ${input}`;
    const allowed = await runHook("pre", {
      cwd: root,
      session_id: "parent-session",
      agent_id: "codex-review-agent",
      tool_name: "exec_command",
      tool_input: { command },
    }, null, {
      ...process.env,
      HARNESS_HOST: "codex",
      CODEX_HOME: codexHome,
      CODEX_THREAD_ID: "child-session",
    });
    assert.equal(allowed.code, 0, allowed.stderr);
    const grant = JSON.parse(readFileSync(join(project, ".tmp", "logo-guard", "capability.logo-review.json"), "utf8"));
    assert.equal(grant.sessionId, "child-session");
    assert.equal(grant.codexHome, codexHome);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

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

test("pre hook allows repo-root reads when a logo project exists but is not touched", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-unscoped-sed-"));
  try {
    mkdirSync(join(root, "artifacts", "logo", "orbit"), { recursive: true });
    const result = await runHook("pre", { cwd: root, tool_name: "Bash", tool_input: { command: "sed -n '1,20p' README.md" } });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre hook allows an unrelated interpreter command from repo root when a logo project exists", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-opaque-root-shell-"));
  try {
    mkdirSync(join(root, "artifacts", "logo", "orbit"), { recursive: true });
    const command = "node --input-type=module -e 'console.log(1)'";
    const result = await runHook("pre", { cwd: root, tool_name: "Bash", tool_input: { command } });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre hook denies an opaque shell mutation from inside a logo project", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-opaque-shell-"));
  try {
    const project = join(root, "artifacts", "logo", "orbit");
    mkdirSync(project, { recursive: true });
    const command = `node -e "require('node:fs').writeFileSync(['arti','facts','logo','orbit','dist','primary','mark.svg'].join('/'),'forged')"`;
    const result = await runHook("pre", { cwd: project, tool_name: "Bash", tool_input: { command } });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre hook rejects a node eval command containing an approved wrapper substring", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-spoof-"));
  try {
    const wrapper = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));
    const command = `node -e "require('node:fs').writeFileSync(process.argv[1],'forged')" artifacts/logo/orbit/dist/primary/mark.svg ${wrapper}`;
    const result = await runHook("pre", { cwd: root, tool_name: "Bash", tool_input: { command } });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre hook allows only an exact registered render invocation for the project root", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-writer-allow-"));
  try {
    mkdirSync(join(root, "artifacts", "logo", "orbit"), { recursive: true });
    const wrapper = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));
    const result = await runHook("pre", { cwd: root, session_id: "hook-render-session", tool_name: "Bash", tool_input: { command: `node ${wrapper} logo render artifacts/logo/orbit release` } });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre hook allows only the exact registered package-lock writer invocation", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-lock-allow-"));
  try {
    mkdirSync(join(root, "artifacts", "logo", "orbit"), { recursive: true });
    const wrapper = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));
    const allowed = await runHook("pre", { cwd: root, session_id: "hook-lock-session", tool_name: "Bash", tool_input: { command: `node ${wrapper} logo lock artifacts/logo/orbit` } });
    assert.equal(allowed.code, 0);
    assert.equal(allowed.stdout, "");
    const extraArgument = await runHook("pre", { cwd: root, session_id: "hook-lock-session", tool_name: "Bash", tool_input: { command: `node ${wrapper} logo lock artifacts/logo/orbit --unsafe` } });
    assert.equal(JSON.parse(extraArgument.stdout).hookSpecificOutput.permissionDecision, "deny");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pre hook rejects the removed external strip-tool override", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-preview-override-"));
  try {
    mkdirSync(join(root, "artifacts", "logo", "orbit"), { recursive: true });
    const wrapper = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));
    const command = `node ${wrapper} logo preview artifacts/logo/orbit --strip-tool /tmp/external-tool.mjs`;
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
    const wrapper = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));
    const result = await runHook("pre", { cwd: root, tool_name: "Bash", tool_input: { command: `node ${wrapper} logo render artifacts/logo/orbit release` } });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
    assert.match(result.stdout, /PROJECT_ROOT_UNREGISTERED/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("invalid hook JSON fails closed", async () => {
  const result = await runHook("pre", {}, "{not-json");
  assert.equal(result.code, 2);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("stop does not block an unrelated repo-root session with a stale logo project", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-unrelated-stop-"));
  try {
    mkdirSync(join(root, "artifacts", "logo", "orbit"), { recursive: true });
    const result = await runHook("stop", { cwd: root });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("stop revalidates a logo project touched earlier by the same repo-root session", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-engaged-stop-"));
  const pluginData = join(root, "plugin-data");
  const env = { ...process.env, HARNESS_HOST: "codex", PLUGIN_DATA: pluginData };
  const sessionId = "logo-engaged-session";
  try {
    const project = join(root, "artifacts", "logo", "orbit");
    mkdirSync(project, { recursive: true });
    const post = await runHook("post", {
      cwd: root,
      session_id: sessionId,
      tool_name: "Write",
      tool_input: { file_path: "artifacts/logo/orbit/src/concept.svg", content: "<svg/>" },
    }, null, env);
    assert.equal(post.code, 0, post.stderr);
    assert.match(post.stdout, /PLAN_CONTRACT_MISSING/u);

    const stopped = await runHook("stop", { cwd: root, session_id: sessionId }, null, env);
    assert.equal(stopped.code, 0, stopped.stderr);
    assert.notEqual(stopped.stdout, "", "the session engagement must survive between hook processes");
    const output = JSON.parse(stopped.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /PLAN_CONTRACT_MISSING/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("stop fails closed when a logo project is missing plan.contract.json", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-plan-"));
  try {
    const project = join(root, "artifacts", "logo", "orbit");
    mkdirSync(project, { recursive: true });
    const result = await runHook("stop", { cwd: project });
    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.match(output.reason, /PLAN_CONTRACT_MISSING/u);

    const retry = await runHook("stop", { cwd: project, stop_hook_active: true });
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
    writeFileSync(plan, JSON.stringify({ schema: "brand-logo-production/plan/v1", artifactId: "orbit", targetStage: "release" }));
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
    writeFileSync(join(project, "plan.contract.json"), JSON.stringify({ schema: "brand-logo-production/plan/v1", artifactId: "orbit", targetStage: "release" }));
    const result = await runHook("pre", { cwd: root, tool_name: "MultiEdit", tool_input: { source_path: "artifacts/logo/orbit/plan.contract.json", destination_path: "artifacts/logo/orbit/plan.contract.bak" } });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
    assert.match(result.stdout, /PLAN_STAGE_WRITER_REQUIRED/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("stop does not silently ignore the thirty-third logo project", async () => {
  const root = mkdtempSync(join(tmpdir(), "logo-many-"));
  try {
    for (let index = 0; index < 33; index += 1) mkdirSync(join(root, "artifacts", "logo", `logo-${String(index).padStart(2, "0")}`), { recursive: true });
    const result = await runHook("stop", { cwd: join(root, "artifacts", "logo", "logo-00") });
    assert.equal(result.code, 0);
    assert.match(JSON.parse(result.stdout).reason, /logo-32/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
