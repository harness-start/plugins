import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  detectLanguageDrift,
  stripNonProseMarkdown,
} from "../scripts/lib/language-drift.mjs";
import { SESSION_CONTEXT } from "../scripts/lib/policy.mjs";

const SESSION_ENTRY = fileURLToPath(
  new URL("../scripts/in-chinese-hook-session-start.mjs", import.meta.url),
);
const STOP_ENTRY = fileURLToPath(
  new URL("../scripts/in-chinese-hook-stop.mjs", import.meta.url),
);

function runEntry(entry, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

function languages(text) {
  return detectLanguageDrift(text).map((finding) => finding.language);
}

test("detects Korean prose at the minimum script threshold", () => {
  assert.deepEqual(languages("가나다라마바사아자차카타"), ["korean"]);
});

test("detects Japanese kana without treating Han text as Japanese", () => {
  assert.deepEqual(languages("あいうえおかきくけこさし"), ["japanese"]);
  assert.deepEqual(languages("这是十二个以上的纯中文汉字内容，不应当被误判。"), []);
});

test("detects Thai prose at the minimum script threshold", () => {
  assert.deepEqual(languages("กขคฆงจฉชซฌญฎ"), ["thai"]);
});

test("allows target scripts below twelve characters", () => {
  assert.deepEqual(languages("가나다라마바사아자차카"), []);
  assert.deepEqual(languages("あいうえおかきくけこさ"), []);
  assert.deepEqual(languages("กขคฆงจฉชซฌญ"), []);
});

test("allows target scripts below one quarter of Unicode letters", () => {
  const mostlyEnglish = `${"technical".repeat(8)} 가나다라마바사아자차카타`;
  assert.deepEqual(languages(mostlyEnglish), []);
});

test("detects drift isolated on one line", () => {
  const text = `${"technical".repeat(12)}\nあいうえおかきくけこさし`;
  assert.deepEqual(languages(text), ["japanese"]);
});

test("detects drift accumulated across the complete response", () => {
  const text = "가나다라\n마바사아\n자차카타";
  assert.deepEqual(languages(text), ["korean"]);
});

test("ignores scripts in code, inline code, quotes, URLs, and link targets", () => {
  const markdown = [
    "```text",
    "あいうえおかきくけこさし",
    "```",
    "`가나다라마바사아자차카타`",
    "> กขคฆงจฉชซฌญฎ",
    "[文档](https://example.com/あいうえおかきくけこさし)",
  ].join("\n");

  assert.deepEqual(languages(markdown), []);
  assert.equal(stripNonProseMarkdown(markdown).includes("あいうえお"), false);
});

test("SessionStart emits the exact response policy context", async () => {
  const result = await runEntry(SESSION_ENTRY, JSON.stringify({ session_id: "s1" }));
  const output = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: SESSION_CONTEXT,
    },
  });
});

test("SessionStart fails open for malformed JSON", async () => {
  const result = await runEntry(SESSION_ENTRY, "{");

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

for (const [language, text] of [
  ["韩文", "가나다라마바사아자차카타"],
  ["日文假名", "あいうえおかきくけこさし"],
  ["泰文", "กขคฆงจฉชซฌญฎ"],
]) {
  test(`Stop blocks long ${language} prose and requests a complete Chinese rewrite`, async () => {
    const result = await runEntry(
      STOP_ENTRY,
      JSON.stringify({ last_assistant_message: text }),
    );
    const output = JSON.parse(result.stdout);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.equal(output.decision, "block");
    assert.match(output.reason, /\[in-chinese\] language drift detected/u);
    assert.match(output.reason, new RegExp(language, "u"));
    assert.match(output.reason, /完整使用简体中文重新作答/u);
  });
}

test("Stop supports camelCase assistant text used by either host adapter", async () => {
  const result = await runEntry(
    STOP_ENTRY,
    JSON.stringify({ lastAssistantMessage: "가나다라마바사아자차카타" }),
  );

  assert.equal(JSON.parse(result.stdout).decision, "block");
});

test("Stop allows clean Chinese and English technical prose", async () => {
  const result = await runEntry(
    STOP_ENTRY,
    JSON.stringify({
      last_assistant_message: "使用 Node.js API 运行 node --test，然后检查结果。",
    }),
  );

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("Stop fails open for missing text and malformed JSON", async () => {
  const missing = await runEntry(STOP_ENTRY, JSON.stringify({}));
  const malformed = await runEntry(STOP_ENTRY, "{");

  assert.equal(missing.stdout, "");
  assert.equal(malformed.stdout, "");
  assert.equal(missing.code, 0);
  assert.equal(malformed.code, 0);
});

test("Stop retry flags prevent an infinite blocking loop", async () => {
  for (const event of [
    { stop_hook_active: true },
    { stopHookActive: true },
  ]) {
    const result = await runEntry(
      STOP_ENTRY,
      JSON.stringify({
        ...event,
        last_assistant_message: "あいうえおかきくけこさし",
      }),
    );
    assert.equal(result.stdout, "");
    assert.equal(result.code, 0);
  }
});
