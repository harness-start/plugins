import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { promptMethodContext } from "../src/entries/hooks/engineering-practice.ts";

const entry = resolve(import.meta.dirname, "../dist/hooks/engineering-practice.mjs");

function run(mode: "session-start" | "user-prompt", event: Record<string, unknown>) {
  return spawnSync(process.execPath, [entry, mode], {
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
  assert.doesNotMatch(context, /stop|block|outcome challenge/iu);
});

test("malformed input fails open", () => {
  const result = spawnSync(process.execPath, [entry], { input: "not-json", encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("routes ordinary implementation prompts to judgment without an unnecessary checkpoint", () => {
  const result = run("user-prompt", { prompt: "Refactor a private parser helper without changing behavior." });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, "UserPromptSubmit");
  assert.match(output.additionalContext, /engineering-judgment.*public contract.*verify/isu);
  assert.doesNotMatch(output.additionalContext, /engineering-review-checkpoint/iu);
});

test("routes high-risk implementation prompts to one checkpoint review", () => {
  const result = run("user-prompt", { prompt: "Migrate authentication state across the public API and database schema." });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /engineering-judgment.*engineering-review-checkpoint.*one read-only reviewer/isu);
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
  assert.equal(unrelated.stdout, "");
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
  assert.match(context, /engineering-verification.*after the last mutation.*unverified/isu);
});

test("routes Chinese verification prompts", () => {
  const result = run("user-prompt", { prompt: "验证当前代码变更，运行测试和构建后再确认完成。" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /engineering-verification.*last mutation/isu);
});

test("unrelated prompts stay silent", () => {
  const result = run("user-prompt", { prompt: "Reply with exactly OK." });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});
