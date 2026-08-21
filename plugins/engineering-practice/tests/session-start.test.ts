import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

const entry = resolve(import.meta.dirname, "../dist/hooks/engineering-practice.mjs");

function run(mode: "session-start" | "user-prompt", event: Record<string, unknown>) {
  return spawnSync(process.execPath, [entry, mode], {
    input: JSON.stringify(event),
    encoding: "utf8",
  });
}

test("offers bundled engineering methods without making Skill loading an outcome prerequisite", () => {
  const result = run("session-start", { cwd: process.cwd() });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /engineering-judgment.*engineering-review.*engineering-verification/isu);
  assert.match(context, /optional.*not.*(?:prerequisite|completion evidence)/isu);
  assert.match(context, /fresh command evidence/iu);
  assert.doesNotMatch(context, /stop|block|outcome challenge/iu);
});

test("malformed input fails open", () => {
  const result = spawnSync(process.execPath, [entry], { input: "not-json", encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("routes implementation prompts to the bundled judgment method", () => {
  const result = run("user-prompt", { prompt: "Refactor the parser without changing its public API." });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, "UserPromptSubmit");
  assert.match(output.additionalContext, /engineering-judgment.*public contract.*verify/isu);
});

test("routes review prompts to the bundled read-only review method", () => {
  const result = run("user-prompt", { prompt: "Review the current diff for correctness regressions." });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /engineering-review.*read-only.*severity.*file:line.*evidence.*recovery/isu);
});

test("routes verification prompts to the bundled verification method", () => {
  const result = run("user-prompt", { prompt: "Verify the change before claiming completion." });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /engineering-verification.*after the last mutation.*unverified/isu);
});

test("unrelated prompts stay silent", () => {
  const result = run("user-prompt", { prompt: "Reply with exactly OK." });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});
