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

import { readModuleRoutes } from "../../../../../core/tests/support/aio-routes.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ENTRY = join(ROOT, "dist", "hooks", "dispatcher.mjs");

function runEntry(event, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, "codex", "UserPromptSubmit"], {
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

test("owner routes the private intent module only on UserPromptSubmit", () => {
  for (const host of ["claude", "codex"] as const) {
    assert.deepEqual(
      Object.keys(readModuleRoutes(import.meta.url, host, "intent")),
      ["UserPromptSubmit"],
    );
  }

  const skillNames = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name === "intent-discovery");
  assert.deepEqual(skillNames, ["intent-discovery"]);
  assert.equal(existsSync(join(ROOT, "skill-deps.json")), false);
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
    assert.match(context, /concrete target.*outcome.*constraints.*acceptance/isu);
    assert.match(context, /do not load.*Skill.*spawn.*discovery/isu);
    assert.match(context, /named seam.*callers.*tests.*documentation.*history/isu);
    assert.match(context, /time-box.*repeated evidence.*reproduce/isu);
    assert.match(context, /hidden evaluator.*solution patch.*answer cache/isu);
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
  assert.equal(results.filter((result) => {
    const context = outputOf(result)?.hookSpecificOutput?.additionalContext ?? "";
    return context.includes("intent-discovery");
  }).length, 1);
});

test("missing session identity fails open without creating sticky state", async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "intent-no-session-"));
  const env = {
    ...platformEnv("codex", dataRoot),
    AI_EXPERTS_SESSION_ID: "",
  };

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
  assert.match(skill, /materially new task/iu);
  assert.match(skill, /continuation|follow-up/iu);
  assert.match(skill, /do not.*full discovery/iu);

  const openai = readFileSync(
    join(ROOT, "skills", "intent-discovery", "agents", "openai.yaml"),
    "utf8",
  );
  assert.match(openai, /display_name: "Intent Discovery"/u);
});
