import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

const entry = resolve(import.meta.dirname, "../dist/hooks/engineering-practice.mjs");

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
  assert.match(context, /extend.*named seam.*old call forms.*add or extend tests.*zero.*one.*two.*many/isu);
  assert.match(context, /P0-P3 severity.*exact file:line.*concrete evidence.*verifiable fix/isu);
  assert.doesNotMatch(context, /before acting|\brequire\b/iu);
  assert.doesNotMatch(context, /engineering-debugging|debug-workflow|humanizer|stop-slop|shuorenhua|\$HOME\/\.agents\/skills/iu);
});

test("malformed input fails open", () => {
  const result = spawnSync(process.execPath, [entry], { input: "not-json", encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});
