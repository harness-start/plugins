import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOTS = [];
const PLUGIN_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ENTRIES = Object.fromEntries(
  ["session-start", "user-prompt", "post-tool", "stop"].map((name) => [
    name,
    fileURLToPath(new URL("../../../dist/hooks/dispatcher.mjs", import.meta.url)),
  ]),
);
const EVENTS = { "session-start": "SessionStart", "user-prompt": "UserPromptSubmit", "post-tool": "PostToolUse", stop: "Stop" };

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
    const host = env?.HARNESS_HOST === "claude" ? "claude" : "codex";
    const child = spawn(process.execPath, [ENTRIES[name], host, EVENTS[name]], {
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
  writeFileSync(join(cwd, ".language-output.mjs"), "export default { defaultProfile: 'ja-JP' };\n");
  const env = { PLUGIN_DATA: data };
  const started = await runEntry("session-start", event(cwd, "profile"), env);
  const output = JSON.parse(started.stdout);
  assert.equal(started.code, 0);
  const context = output.hookSpecificOutput.additionalContext;
  assert.match(context, /profile=ja-JP/u);
  assert.match(
    context,
    /response language profile/isu,
  );
  assert.match(context, /JSON.*YAML.*Markdown machine blocks/isu);
  assert.match(
    context,
    /schema names.*keys.*enum literals.*identifiers.*remain unchanged/isu,
  );
  assert.match(context, /generated files.*user or project.*artifact language/isu);

  await runEntry("user-prompt", event(cwd, "profile", { prompt: "Please continue to answer in Korean." }), env);
  const resumed = await runEntry("session-start", event(cwd, "profile", { source: "resume" }), env);
  assert.match(JSON.parse(resumed.stdout).hookSpecificOutput.additionalContext, /profile=ko-KR/u);
});

test("Codex provenance session ids keep missing-event sessions isolated", async () => {
  const cwd = root();
  const data = root();
  const firstEnv = {
    HARNESS_HOST: "codex",
    PLUGIN_DATA: data,
    AI_EXPERTS_SESSION_ID: "provenance-one",
  };
  await runEntry("session-start", event(cwd, ""), firstEnv);
  await runEntry("user-prompt", event(cwd, "", { prompt: "Please continue to answer in Korean." }), firstEnv);

  const second = await runEntry("session-start", event(cwd, ""), {
    ...firstEnv,
    AI_EXPERTS_SESSION_ID: "provenance-two",
  });
  assert.equal(second.code, 0, second.stderr);
  assert.match(JSON.parse(second.stdout).hookSpecificOutput.additionalContext, /profile=zh-CN/u);
});

test("state for equal session ids is isolated by host platform", async () => {
  const cwd = root();
  const codexData = root();
  const claudeData = root();
  const session = "shared-host-id";
  const codexEnv = { HARNESS_HOST: "codex", PLUGIN_DATA: codexData };
  await runEntry("session-start", event(cwd, session), codexEnv);
  await runEntry("user-prompt", event(cwd, session, { prompt: "Please continue to answer in Korean." }), codexEnv);

  const claude = await runEntry("session-start", event(cwd, session, { source: "resume" }), {
    HARNESS_HOST: "claude",
    CLAUDE_PLUGIN_DATA: claudeData,
  });
  assert.equal(claude.code, 0, claude.stderr);
  assert.match(JSON.parse(claude.stdout).hookSpecificOutput.additionalContext, /profile=zh-CN/u);
});

test("missing trusted session identity does not create shared sticky state", async () => {
  const cwd = root();
  const data = root();
  const result = await runEntry("session-start", event(cwd, ""), {
    HARNESS_HOST: "codex",
    PLUGIN_DATA: data,
    AI_EXPERTS_SESSION_ID: "",
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(existsSync(join(cwd, ".language-output", "state")), false);
});

test("SessionStart uses state and creates only the governance-local gitignore", async () => {
  const cwd = root();
  const data = root();
  writeFileSync(join(cwd, ".gitignore"), "vendor/\n", "utf8");

  await runEntry("session-start", event(cwd, "layout"), { PLUGIN_DATA: data });

  assert.equal(existsSync(join(cwd, ".language-output", "state")), true);
  assert.equal(existsSync(join(cwd, ".language-output", ".state")), false);
  assert.equal(readFileSync(join(cwd, ".language-output", ".gitignore"), "utf8"), "*\n");
  assert.equal(readFileSync(join(cwd, ".gitignore"), "utf8"), "vendor/\n");
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
  assert.match(
    output.hookSpecificOutput.additionalContext,
    /artifact language profile/isu,
  );

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

test("artifactProfile governs generated files without changing the response profile", async () => {
  const cwd = root();
  const data = root();
  writeFileSync(
    join(cwd, ".language-output.mjs"),
    "export default { defaultProfile: 'zh-CN', artifactProfile: 'ja-JP' };\n",
  );
  const env = { PLUGIN_DATA: data };
  const started = await runEntry("session-start", event(cwd, "artifact-profile"), env);
  const context = JSON.parse(started.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /profile=zh-CN/u);
  assert.match(context, /artifact-profile=ja-JP/u);

  const artifact = await runEntry("post-tool", event(cwd, "artifact-profile", {
    tool_name: "Write",
    tool_input: { file_path: "guide.md", content: "設定を保存してからテストを実行してください。" },
  }), env);
  assert.equal(artifact.stdout, "");

  const response = await runEntry("stop", event(cwd, "artifact-profile", {
    last_assistant_message: "設定を保存してからテストを実行してください。",
  }), env);
  assert.equal(JSON.parse(response.stdout).decision, "block");
  assert.match(JSON.parse(response.stdout).reason, /profile zh-CN/u);
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

test("all Codex providers receive the same PostToolUse feedback", async () => {
  const cwd = root();
  const data = root();
  const env = { PLUGIN_DATA: data, PLUGIN_ROOT, DEEPSEEK_MODEL: "deepseek-v4-flash" };
  await runEntry("session-start", event(cwd, "codex-feedback"), env);
  const input = event(cwd, "codex-feedback", {
    tool_name: "Bash",
    tool_input: { command: "printf '가나다라마바사아자차카타\\n' > answer.txt" },
  });
  const result = await runEntry("post-tool", input, env);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Hangul/u);

  const standardInput = event(cwd, "codex-standard-feedback", {
    tool_name: "Bash",
    tool_input: { command: "printf '가나다라마바사아자차카타\\n' > answer.txt" },
  });
  await runEntry("session-start", event(cwd, "codex-standard-feedback"), {
    PLUGIN_DATA: data,
    PLUGIN_ROOT,
    DEEPSEEK_MODEL: "",
  });
  const standardCodex = await runEntry("post-tool", standardInput, {
    PLUGIN_DATA: data,
    PLUGIN_ROOT,
    DEEPSEEK_MODEL: "",
  });
  assert.equal(standardCodex.code, 0);
  assert.equal(standardCodex.stdout, "");
  assert.match(standardCodex.stderr, /Hangul/u);
});

test("Stop blocks drift once, then allows the host retry", async () => {
  const cwd = root();
  const data = root();
  const env = { PLUGIN_DATA: data };
  await runEntry("session-start", event(cwd, "stop"), env);
  const blocked = await runEntry("stop", event(cwd, "stop", {
    last_assistant_message: "あいうえおかきくけこさし",
  }), env);
  const blockedOutput = JSON.parse(blocked.stdout);
  assert.equal(blockedOutput.decision, "block");
  assert.match(blockedOutput.reason, /profile zh-CN/u);
  assert.match(
    blockedOutput.reason,
    /response language profile/isu,
  );

  const retry = await runEntry("stop", event(cwd, "stop", {
    stop_hook_active: true,
    last_assistant_message: "あいうえおかきくけこさし",
  }), env);
  assert.equal(retry.code, 0);
  assert.equal(retry.stdout, "");
});

test("Stop blocks Traditional Chinese on the zh-CN profile", async () => {
  const cwd = root();
  const data = root();
  const env = { PLUGIN_DATA: data };
  await runEntry("session-start", event(cwd, "trad-on-cn"), env);
  const blocked = await runEntry("stop", event(cwd, "trad-on-cn", {
    last_assistant_message: "這是十二個以上的中文漢字內容用於檢測",
  }), env);
  assert.equal(JSON.parse(blocked.stdout).decision, "block");
  assert.match(JSON.parse(blocked.stdout).reason, /Traditional Chinese/u);
});

test("Stop blocks Simplified Chinese on the zh-TW profile", async () => {
  const cwd = root();
  const data = root();
  writeFileSync(join(cwd, ".language-output.mjs"), "export default { defaultProfile: 'zh-TW' };\n");
  const env = { PLUGIN_DATA: data };
  await runEntry("session-start", event(cwd, "simp-on-tw"), env);
  const blocked = await runEntry("stop", event(cwd, "simp-on-tw", {
    last_assistant_message: "这是十二个以上的中文汉字内容用于检测",
  }), env);
  assert.equal(JSON.parse(blocked.stdout).decision, "block");
  assert.match(JSON.parse(blocked.stdout).reason, /Simplified Chinese/u);
});

test("Stop blocks Chinese Han without kana on the ja-JP profile", async () => {
  const cwd = root();
  const data = root();
  writeFileSync(join(cwd, ".language-output.mjs"), "export default { defaultProfile: 'ja-JP' };\n");
  const env = { PLUGIN_DATA: data };
  await runEntry("session-start", event(cwd, "zh-on-ja"), env);
  const blocked = await runEntry("stop", event(cwd, "zh-on-ja", {
    last_assistant_message: "这是十二个以上的中文汉字内容用于检测",
  }), env);
  assert.equal(JSON.parse(blocked.stdout).decision, "block");
  assert.match(JSON.parse(blocked.stdout).reason, /Chinese Han/u);

  const allowed = await runEntry("stop", event(cwd, "zh-on-ja", {
    last_assistant_message: "設定を保存してからテストを実行してください。",
  }), env);
  assert.equal(allowed.stdout, "");
});

test("invalid project configuration warns and keeps the strict default", async () => {
  const cwd = root();
  const data = root();
  writeFileSync(join(cwd, ".language-output.mjs"), "export default { defaultProfile: 'fr-FR' };\n");
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
    assert.doesNotMatch(result.stderr, /aio-dispatcher|stack|Error:/u);
  }
});
