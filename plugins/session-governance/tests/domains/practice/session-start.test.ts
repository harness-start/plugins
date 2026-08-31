import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { promptMethodContext } from "../../../src/domains/practice/entries/hooks/engineering-practice.ts";

const entry = resolve(import.meta.dirname, "../../../dist/hooks/dispatcher.mjs");

function run(mode: "session-start" | "user-prompt", event: Record<string, unknown>) {
  return spawnSync(process.execPath, [entry, "codex", ({ "session-start": "SessionStart", pre: "PreToolUse", post: "PostToolUse", failure: "PostToolUseFailure", stop: "Stop", session: "SessionStart", prompt: "UserPromptSubmit", "user-prompt": "UserPromptSubmit", subagent: "SubagentStart", "subagent-stop": "SubagentStop" } as Record<string, string>)[mode] ?? mode], {
    input: JSON.stringify(event),
    encoding: "utf8",
  });
}

test("offers bundled engineering methods and checkpoint review without making Skill loading an outcome prerequisite", () => {
  const result = run("session-start", { cwd: process.cwd() });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /engineering-judgment.*engineering-review.*engineering-review-checkpoint.*engineering-verification/isu);
  assert.match(context, /optional.*not.*(?:prerequisite|completion evidence)/isu);
  assert.match(context, /fresh command evidence/iu);
  assert.match(context, /narrow.*low-risk.*focused/isu);
  assert.match(context, /do not.*full.*suite/isu);
  assert.match(context, /exact target.*test file.*package.*default.*broad/isu);
  assert.doesNotMatch(context, /outcome challenge/iu);
});

test("malformed input fails open", () => {
  const result = spawnSync(process.execPath, [entry, "codex", "SessionStart"], { input: "not-json", encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("routes ordinary implementation prompts to judgment without an unnecessary checkpoint", () => {
  const result = run("user-prompt", { prompt: "Refactor a private parser helper without changing behavior." });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, "UserPromptSubmit");
  assert.match(output.additionalContext, /engineering-judgment.*public contract.*focused.*low-risk/isu);
  assert.match(output.additionalContext, /do not.*full.*suite/isu);
  assert.doesNotMatch(output.additionalContext, /engineering-review-checkpoint/iu);
});

test("does not treat preserving a stable public API as a high-risk API change", () => {
  const result = run("user-prompt", {
    prompt: "Fix one retry-delay regression. Preserve the stable public API, update the target test first, and verify the change.",
  });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /selected scope.*focused.*exact target.*do not run.*package.*default/isu);
  assert.doesNotMatch(context, /high-risk|engineering-review-checkpoint|broader verification/iu);
});

test("routes high-risk implementation prompts to one checkpoint review", () => {
  const result = run("user-prompt", { prompt: "Migrate authentication state across the public API and database schema." });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /engineering-judgment.*engineering-review-checkpoint.*one read-only reviewer.*broader verification/isu);
});

test("keeps an explicit public API addition on the high-risk route", () => {
  const result = run("user-prompt", { prompt: "Add a public API endpoint for exports and verify the change." });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /high-risk implementation.*engineering-review-checkpoint.*broader verification/isu);
});

test("keeps a high-risk implementation on the checkpoint route when the prompt also names review", () => {
  const result = run("user-prompt", {
    prompt: "Change the public authorization API, then run the engineering review checkpoint with one read-only reviewer after focused tests pass.",
  });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /high-risk implementation.*engineering-review-checkpoint.*one read-only reviewer/isu);
});

test("routes an explicit checkpoint request before the general review route", () => {
  const result = run("user-prompt", { prompt: "请神审查当前 diff，使用 engineering review checkpoint。" });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /explicit.*engineering-review-checkpoint.*read-only reviewer/isu);
});

test("routes review prompts to the bundled read-only review method", () => {
  const result = run("user-prompt", { prompt: "Review the current diff for correctness regressions." });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /engineering-review.*read-only.*severity.*file:line.*evidence.*recovery/isu);
  assert.match(context, /single file:line.*not.*line range/isu);
});

test("routes Chinese engineering review prompts without matching unrelated commercial review", () => {
  assert.match(
    promptMethodContext({ prompt: "审计 plugins 下的实现，检查当前代码变更。" }),
    /engineering-review.*read-only/isu,
  );
  const review = run("user-prompt", { prompt: "审计 plugins 下的实现，检查当前代码变更。" });
  assert.equal(review.status, 0, review.stderr);
  assert.match(JSON.parse(review.stdout).hookSpecificOutput.additionalContext, /engineering-review.*read-only/isu);

  const unrelated = run("user-prompt", { prompt: "评审这三家供应商的报价和交付周期。" });
  assert.equal(unrelated.status, 0, unrelated.stderr);
  assert.doesNotMatch(unrelated.stdout, /engineering-review/iu);
});

test("routes Chinese high-risk implementation prompts to one checkpoint review", () => {
  const result = run("user-prompt", { prompt: "修改认证流程并迁移数据库 schema，然后完成验证。" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    JSON.parse(result.stdout).hookSpecificOutput.additionalContext,
    /high-risk implementation.*engineering-review-checkpoint.*one read-only reviewer/isu,
  );
});

test("routes verification prompts to the bundled verification method", () => {
  const result = run("user-prompt", { prompt: "Verify the change before claiming completion." });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /engineering-verification.*smallest.*scope.*after the last mutation.*unverified/isu);
  assert.match(context, /direct oracle.*exact target.*test file.*not.*package.*default/isu);
});

test("routes Chinese verification prompts", () => {
  const result = run("user-prompt", { prompt: "验证当前代码变更，运行测试和构建后再确认完成。" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /engineering-verification.*smallest.*scope.*last mutation/isu);
});

test("unrelated prompts do not add engineering-practice guidance", () => {
  const result = run("user-prompt", { prompt: "Reply with exactly OK." });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /\[Engineering Practice\]/u);
});
