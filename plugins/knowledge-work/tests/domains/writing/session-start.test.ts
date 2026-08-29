import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { professionalWritingContext } from "../../../src/domains/writing/entries/hooks/professional-writing.ts";

const entry = resolve(import.meta.dirname, "../../../dist/hooks/dispatcher.mjs");

function run(mode: "session-start" | "user-prompt", prompt = "") {
  return spawnSync(process.execPath, [entry, "codex", ({ "session-start": "SessionStart", pre: "PreToolUse", post: "PostToolUse", failure: "PostToolUseFailure", stop: "Stop", session: "SessionStart", prompt: "UserPromptSubmit", "user-prompt": "UserPromptSubmit", subagent: "SubagentStart", "subagent-stop": "SubagentStop" } as Record<string, string>)[mode] ?? mode], {
    input: JSON.stringify({ cwd: process.cwd(), prompt }),
    encoding: "utf8",
  });
}

test("publishes lightweight writing guidance without requiring language editors for every response", () => {
  const sourceContext = professionalWritingContext();
  assert.match(sourceContext, /actionable-response/iu);
  assert.match(sourceContext, /visual-explanation/iu);

  const result = run("session-start");
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /MUST load.*actionable-response/isu);
  assert.match(context, /procedure|troubleshoot|choose|unfinished work/iu);
  assert.match(context, /do not wait.*ADHD/isu);
  assert.match(context, /visual-explanation/iu);
  assert.match(context, /ADHD.*diagnos/iu);
  assert.match(context, /smallest useful visual|minimal visual/iu);
  assert.match(context, /language-specific editing.*only.*explicit/isu);
  assert.doesNotMatch(context, /For English prose, require|For Chinese prose, require/iu);
  assert.doesNotMatch(context, /\p{Script=Han}/u);
  assert.doesNotMatch(context, /karpathy-guidelines|systematic-debugging|\$HOME\/\.agents\/skills/iu);
});

test("ordinary Chinese technical requests do not load prose-rewriting methods", () => {
  const result = run("user-prompt", "审计 plugins 下的实现并列出问题。\n");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});

test("ordinary Chinese naturalness editing does not add the de-AI article method", () => {
  const result = run("user-prompt", "把下面内容改成一个简短自然的中文段落。\n");
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /writing-chinese-prose/iu);
  assert.doesNotMatch(context, /ai-flavor-remover|writing-english-prose/iu);
});

test("explicit Chinese de-AI editing selects only the applicable bundled methods", () => {
  const result = run("user-prompt", "请把这篇中文文章去 AI 味，让表达更自然。\n");
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /load each listed bundled method before editing/iu);
  assert.match(context, /writing-chinese-prose.*ai-flavor-remover/isu);
  assert.doesNotMatch(context, /writing-english-prose|writing-markdown-ai-style/iu);
});

test("explicit Markdown prose editing publishes the owner CLI protocol", () => {
  const result = run("user-prompt", "Edit release-note.md so the English Markdown prose sounds natural.\n");
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /writing-english-prose.*writing-markdown-ai-style/isu);
  assert.match(context, /dist\/cli\/harness\.mjs writing analyze <file>/u);
  assert.doesNotMatch(context, /dist\/cli\/analyze-ai-style\.mjs/u);
});

test("malformed input fails open", () => {
  const result = spawnSync(process.execPath, [entry, "codex", "SessionStart"], { input: "not-json", encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});
