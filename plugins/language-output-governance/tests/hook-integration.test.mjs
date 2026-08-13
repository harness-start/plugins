import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOTS = [];
const ENTRIES = Object.fromEntries(
  ["session-start", "user-prompt", "post-tool", "stop"].map((name) => [
    name,
    fileURLToPath(new URL(`../scripts/language-output-hook-${name}.mjs`, import.meta.url)),
  ]),
);

afterEach(() => {
  while (ROOTS.length > 0) rmSync(ROOTS.pop(), { recursive: true, force: true });
});

function root() {
  const value = mkdtempSync(join(tmpdir(), "language-output-test-"));
  ROOTS.push(value);
  return value;
}

function runEntry(name, input, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRIES[name]], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(typeof input === "string" ? input : JSON.stringify(input));
  });
}

function event(cwd, session = "session-1", extra = {}) {
  return { cwd, session_id: session, ...extra };
}

test("SessionStart initializes and resumes the configured profile", async () => {
  const cwd = root();
  const data = root();
  writeFileSync(join(cwd, ".language-output-governance.mjs"), "export default { defaultProfile: 'ja-JP' };\n");
  const env = { PLUGIN_DATA: data };
  const started = await runEntry("session-start", event(cwd, "profile"), env);
  const output = JSON.parse(started.stdout);
  assert.equal(started.code, 0);
  assert.match(output.hookSpecificOutput.additionalContext, /profile=ja-JP/u);

  await runEntry("user-prompt", event(cwd, "profile", { prompt: "Please continue to answer in Korean." }), env);
  const resumed = await runEntry("session-start", event(cwd, "profile", { source: "resume" }), env);
  assert.match(JSON.parse(resumed.stdout).hookSpecificOutput.additionalContext, /profile=ko-KR/u);
});

test("UserPromptSubmit records a stable preferred profile shared with Stop", async () => {
  const cwd = root();
  const data = root();
  const env = { PLUGIN_DATA: data };
  await runEntry("session-start", event(cwd, "intent"), env);
  await runEntry("user-prompt", event(cwd, "intent", { prompt: "后续请使用日文回答。" }), env);
  const allowed = await runEntry("stop", event(cwd, "intent", {
    last_assistant_message: "あいうえおかきくけこさし",
  }), env);
  assert.equal(allowed.stdout, "");
  const resumed = await runEntry("session-start", event(cwd, "intent", { source: "resume" }), env);
  assert.match(JSON.parse(resumed.stdout).hookSpecificOutput.additionalContext, /profile=ja-JP/u);
});

test("Traditional Chinese response intent updates the persisted session profile", async () => {
  const cwd = root();
  const data = root();
  const env = { PLUGIN_DATA: data };
  await runEntry("session-start", event(cwd, "traditional-intent"), env);
  await runEntry("user-prompt", event(cwd, "traditional-intent", { prompt: "請用繁體中文回覆。" }), env);
  const resumed = await runEntry("session-start", event(cwd, "traditional-intent", { source: "resume" }), env);
  assert.match(JSON.parse(resumed.stdout).hookSpecificOutput.additionalContext, /profile=zh-TW/u);
});

test("translation authorization does not change the preferred profile", async () => {
  const cwd = root();
  const data = root();
  const env = { PLUGIN_DATA: data };
  await runEntry("session-start", event(cwd, "translation"), env);
  await runEntry("user-prompt", event(cwd, "translation", { prompt: "把这段内容翻译成泰文。" }), env);
  const resumed = await runEntry("session-start", event(cwd, "translation", { source: "resume" }), env);
  assert.match(JSON.parse(resumed.stdout).hookSpecificOutput.additionalContext, /profile=zh-CN/u);
  const allowed = await runEntry("stop", event(cwd, "translation", {
    last_assistant_message: "กขคฆงจฉชซฌญฎ",
  }), env);
  assert.equal(allowed.stdout, "");
});

test("PostToolUse reports generated input once and never scans tool output", async () => {
  const cwd = root();
  const data = root();
  const env = { PLUGIN_DATA: data };
  await runEntry("session-start", event(cwd, "tool"), env);
  const first = await runEntry("post-tool", event(cwd, "tool", {
    tool_name: "Write",
    tool_input: { file_path: "answer.txt", content: "가나다라마바사아자차카타" },
    tool_response: { content: "กขคฆงจฉชซฌญฎ" },
  }), env);
  const output = JSON.parse(first.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(output.hookSpecificOutput.additionalContext, /answer\.txt/u);

  const second = await runEntry("post-tool", event(cwd, "tool", {
    tool_name: "Write",
    tool_input: { file_path: "second.txt", content: "あいうえおかきくけこさし" },
  }), env);
  assert.equal(second.stdout, "");

  const outputOnly = await runEntry("post-tool", event(cwd, "output-only", {
    tool_name: "Bash",
    tool_input: { command: "printf technical" },
    tool_response: { stdout: "가나다라마바사아자차카타" },
  }), { PLUGIN_DATA: data });
  assert.equal(outputOnly.stdout, "");
});

test("PostToolUse checks quoted natural-language payloads without shell syntax dilution", async () => {
  const cwd = root();
  const data = root();
  const env = { PLUGIN_DATA: data };
  await runEntry("session-start", event(cwd, "quoted-shell"), env);
  const result = await runEntry("post-tool", event(cwd, "quoted-shell", {
    tool_name: "Bash",
    tool_input: {
      command: "printf '가나다라마바사아자차카타\\n' > answer.txt && wc -c answer.txt && xxd answer.txt",
    },
  }), env);
  const output = JSON.parse(result.stdout);
  assert.match(output.hookSpecificOutput.additionalContext, /Hangul/u);
});

test("DeepSeek-backed Codex defers PostToolUse feedback without consuming the session report", async () => {
  const cwd = root();
  const data = root();
  const env = { PLUGIN_DATA: data, PLUGIN_ROOT: "/plugin", DEEPSEEK_MODEL: "deepseek-v4-flash" };
  await runEntry("session-start", event(cwd, "codex-feedback"), env);
  const input = event(cwd, "codex-feedback", {
    tool_name: "Bash",
    tool_input: { command: "printf '가나다라마바사아자차카타\\n' > answer.txt" },
  });
  const result = await runEntry("post-tool", input, env);
  assert.equal(result.stdout, "");
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");

  const standardCodex = await runEntry("post-tool", input, {
    PLUGIN_DATA: data,
    PLUGIN_ROOT: "/plugin",
    DEEPSEEK_MODEL: "",
  });
  const output = JSON.parse(standardCodex.stdout);
  assert.match(output.hookSpecificOutput.additionalContext, /Hangul/u);
});

test("Stop blocks drift once per boundary and recursive retries fail open", async () => {
  const cwd = root();
  const data = root();
  const env = { PLUGIN_DATA: data };
  await runEntry("session-start", event(cwd, "stop"), env);
  const blocked = await runEntry("stop", event(cwd, "stop", {
    last_assistant_message: "あいうえおかきくけこさし",
  }), env);
  assert.equal(JSON.parse(blocked.stdout).decision, "block");
  assert.match(JSON.parse(blocked.stdout).reason, /profile zh-CN/u);

  const retry = await runEntry("stop", event(cwd, "stop", {
    stop_hook_active: true,
    last_assistant_message: "あいうえおかきくけこさし",
  }), env);
  assert.equal(retry.stdout, "");

  const later = await runEntry("stop", event(cwd, "stop", {
    last_assistant_message: "あいうえおかきくけこさし",
  }), env);
  assert.equal(JSON.parse(later.stdout).decision, "block");
});

test("invalid project configuration warns and keeps the strict default", async () => {
  const cwd = root();
  const data = root();
  writeFileSync(join(cwd, ".language-output-governance.mjs"), "export default { defaultProfile: 'fr-FR' };\n");
  const result = await runEntry("session-start", event(cwd, "invalid"), { PLUGIN_DATA: data });
  assert.match(result.stderr, /using strict defaults/u);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /profile=zh-CN/u);
});

test("all hook entries fail open for malformed JSON", async () => {
  const data = root();
  for (const name of Object.keys(ENTRIES)) {
    const result = await runEntry(name, "{", { PLUGIN_DATA: data });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  }
});
