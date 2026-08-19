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

test("offers engineering methods without making Skill loading an outcome prerequisite", () => {
  const result = spawnSync(process.execPath, [entry], { input: JSON.stringify({ cwd: process.cwd() }), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /engineering-judgment.*engineering-review.*engineering-verification/isu);
  assert.match(context, /optional.*not.*(?:prerequisite|completion evidence)/isu);
  assert.match(context, /fresh command evidence/iu);
  assert.match(context, /value.*type.*container.*shape.*cardinality.*order.*stability.*warning.*error.*public API/isu);
  assert.match(context, /single example.*not.*complete/isu);
  assert.match(context, /local.*callers.*tests.*documentation.*history/isu);
  assert.match(context, /hidden evaluator.*solution patch/isu);
  assert.match(context, /boundary.*reuse.*normalization.*return path.*synthesi/isu);
  assert.match(context, /first lossy transform.*mixed combinations.*one empty.*another populated/isu);
  assert.match(context, /extend.*named seam.*old call forms.*add or extend tests.*zero.*one.*two.*many/isu);
  assert.match(context, /compatibility.*accepted call forms.*not.*incidental.*container/isu);
  assert.match(context, /ordering.*dependency.*existing.*primitive.*two completely disjoint chains.*at least two items each.*duplicate.*cycle.*diagnostic/isu);
  assert.match(context, /P0-P3 severity.*exact file:line.*concrete evidence.*verifiable fix/isu);
  assert.doesNotMatch(context, /before acting|\brequire\b/iu);
  assert.doesNotMatch(context, /engineering-debugging|debug-workflow|humanizer|stop-slop|shuorenhua|\$HOME\/\.agents\/skills/iu);
});

test("malformed input fails open", () => {
  const result = spawnSync(process.execPath, [entry], { input: "not-json", encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("routes boundary prompts to a short counterexample contract", () => {
  const result = run("user-prompt", {
    prompt: "Fix a tensor conversion that rejects zero-length component arrays after broadcasting.",
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, "UserPromptSubmit");
  assert.match(output.additionalContext, /current (?:exception|rejection).*not.*compatibility proof/isu);
  assert.match(output.additionalContext, /all-empty.*mixed empty.*populated.*ordinary populated/isu);
  assert.match(output.additionalContext, /first lossy.*before.*distinction/isu);
  assert.match(output.additionalContext, /durable.*mixed.*value.*shape/isu);
  assert.doesNotMatch(output.additionalContext, /Repository:|Instance ID:|Base commit:/iu);
});

test("routes ordering prompts to repository-native stable-order challenges", () => {
  const result = run("user-prompt", {
    prompt: "Repair dependency ordering when several independent chains are merged.",
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, "UserPromptSubmit");
  assert.match(output.additionalContext, /search.*repository.*stable.*primitive/isu);
  assert.match(output.additionalContext, /two independent chains.*at least two items/isu);
  assert.match(output.additionalContext, /stable.*frontier/isu);
  assert.match(output.additionalContext, /named.*seam.*zero.*one.*two.*many/isu);
  assert.match(output.additionalContext, /duplicates.*cycle.*exact diagnostic/isu);
  assert.doesNotMatch(output.additionalContext, /Repository:|Instance ID:|Base commit:/iu);
});

test("unrelated prompts stay silent and malformed prompt events fail open", () => {
  const unrelated = run("user-prompt", { prompt: "Rename this local variable." });
  assert.equal(unrelated.status, 0, unrelated.stderr);
  assert.equal(unrelated.stdout, "");

  const malformed = run("user-prompt", { cwd: process.cwd() });
  assert.equal(malformed.status, 0, malformed.stderr);
  assert.equal(malformed.stdout, "");
});
