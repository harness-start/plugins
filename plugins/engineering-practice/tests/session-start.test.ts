import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

const entry = resolve(import.meta.dirname, "../dist/hooks/engineering-practice.mjs");

test("routes only engineering methods and stops on a missing required Skill", () => {
  const result = spawnSync(process.execPath, [entry], { input: JSON.stringify({ cwd: process.cwd() }), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /engineering-judgment.*engineering-debugging.*engineering-verification/isu);
  assert.doesNotMatch(context, /humanizer|stop-slop|shuorenhua|\$HOME\/\.agents\/skills/iu);
});

test("malformed input fails open", () => {
  const result = spawnSync(process.execPath, [entry], { input: "not-json", encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});
