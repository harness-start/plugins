import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENTRY = join(ROOT, "dist", "hooks", "intent-discovery.mjs");

function runEntry(event, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, "prompt"], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

function outputOf(result) {
  const line = result.stdout.trim();
  return line ? JSON.parse(line) : null;
}

function platformEnv(platform, dataRoot) {
  if (platform === "claude") {
    return {
      CLAUDE_PLUGIN_ROOT: ROOT,
      CLAUDE_PLUGIN_DATA: join(dataRoot, "claude"),
      PLUGIN_ROOT: "",
      PLUGIN_DATA: "",
    };
  }
  return {
    PLUGIN_ROOT: ROOT,
    PLUGIN_DATA: join(dataRoot, "codex"),
    CLAUDE_PLUGIN_ROOT: "",
    CLAUDE_PLUGIN_DATA: "",
  };
}

test("plugin manifests expose one bundled skill and only UserPromptSubmit", () => {
  for (const platform of [".claude-plugin", ".codex-plugin"]) {
    const manifest = JSON.parse(readFileSync(join(ROOT, platform, "plugin.json"), "utf8"));
    assert.equal(manifest.version, "2.0.0");
    assert.equal(manifest.skills, "./skills/");
  }

  for (const host of ["claude", "codex"]) {
    const hooks = JSON.parse(readFileSync(join(ROOT, "hooks", `${host}.json`), "utf8")).hooks;
    assert.deepEqual(Object.keys(hooks), ["UserPromptSubmit"]);
  }

  const skillNames = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.deepEqual(skillNames, ["intent-discovery"]);
  assert.equal(existsSync(join(ROOT, "skill-deps.json")), true);
  const deps = JSON.parse(readFileSync(join(ROOT, "skill-deps.json"), "utf8")).skills;
  assert.deepEqual(deps.map(({ name }) => name), ["brainstorming"]);
  assert.deepEqual(deps[0].allowFiles, ["SKILL.md"]);
});

test("first prompt injects discovery and the second prompt is silent", async () => {
  for (const platform of ["claude", "codex"]) {
    const dataRoot = mkdtempSync(join(tmpdir(), `intent-first-${platform}-`));
    const env = platformEnv(platform, dataRoot);
    const event = {
      cwd: dataRoot,
      session_id: `${platform}-session`,
      prompt: "Refactor the cache policy without changing the public API.",
    };

    const first = await runEntry(event, env);
    assert.equal(first.code, 0, first.stderr);
    const context = outputOf(first)?.hookSpecificOutput?.additionalContext ?? "";
    assert.match(context, /intent-discovery/u);
    assert.match(context, /Do not stop to ask the user/u);
    assert.match(context, /continue with the request/u);

    const second = await runEntry({ ...event, prompt: "Continue." }, env);
    assert.equal(second.code, 0, second.stderr);
    assert.equal(outputOf(second), null);
  }
});

test("sessions claim discovery independently", async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "intent-sessions-"));
  const env = platformEnv("codex", dataRoot);

  const first = await runEntry({ cwd: dataRoot, session_id: "one", prompt: "A" }, env);
  const second = await runEntry({ cwd: dataRoot, session_id: "two", prompt: "B" }, env);

  assert.ok(outputOf(first));
  assert.ok(outputOf(second));
});

test("platform state is isolated and never stores prompt text", async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "intent-platforms-"));
  const prompt = "SECRET-PROMPT-MUST-NOT-BE-STORED";

  for (const platform of ["claude", "codex"]) {
    const env = platformEnv(platform, dataRoot);
    const result = await runEntry({ cwd: dataRoot, session_id: "shared-id", prompt }, env);
    assert.equal(result.code, 0, result.stderr);

    const stateDir = join(dataRoot, platform, "intent-discovery", "first-prompts");
    const files = readdirSync(stateDir);
    assert.equal(files.length, 1);
    const state = readFileSync(join(stateDir, files[0]), "utf8");
    assert.doesNotMatch(state, new RegExp(prompt, "u"));
    assert.deepEqual(Object.keys(JSON.parse(state)).sort(), ["injectedAt", "version"]);
  }
});

test("concurrent prompt hooks emit one discovery injection per session", async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "intent-concurrent-"));
  const env = platformEnv("codex", dataRoot);
  const event = { cwd: dataRoot, session_id: "same", prompt: "Inspect this repository." };

  const results = await Promise.all([runEntry(event, env), runEntry(event, env)]);
  assert.deepEqual(results.map((result) => result.code), [0, 0]);
  assert.equal(results.filter((result) => outputOf(result)).length, 1);
});

test("missing session identity fails open without creating sticky state", async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "intent-no-session-"));
  const env = platformEnv("codex", dataRoot);
  delete env.AI_EXPERTS_SESSION_ID;

  const first = await runEntry({ cwd: dataRoot, prompt: "First" }, env);
  const second = await runEntry({ cwd: dataRoot, prompt: "Second" }, env);

  assert.ok(outputOf(first));
  assert.ok(outputOf(second));
});

test("bundled skill defines adaptive fan-out, evidence cards, and no-pause fallback", () => {
  const skill = readFileSync(join(ROOT, "skills", "intent-discovery", "SKILL.md"), "utf8");
  assert.match(skill, /^name: intent-discovery$/mu);
  assert.match(skill, /light.*standard.*intensive/su);
  assert.match(skill, /Answer.*Evidence.*Assumptions.*Gaps.*Parent action/su);
  assert.match(skill, /at most three.*concurrent/iu);
  assert.match(skill, /Do not ask the user/iu);
  assert.match(skill, /single-agent/iu);
  assert.match(skill, /private token-by-token reasoning/iu);

  const openai = readFileSync(
    join(ROOT, "skills", "intent-discovery", "agents", "openai.yaml"),
    "utf8",
  );
  assert.match(openai, /display_name: "Intent Discovery"/u);
});
