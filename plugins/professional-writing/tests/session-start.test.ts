import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

const entry = resolve(import.meta.dirname, "../dist/hooks/professional-writing.mjs");

test("routes only writing methods and stops on a missing required Skill", () => {
  const result = spawnSync(process.execPath, [entry], { input: JSON.stringify({ cwd: process.cwd() }), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /English prose.*writing-english-prose/isu);
  assert.match(context, /Chinese prose.*writing-chinese-prose.*ai-flavor-remover/isu);
  assert.match(context, /writing-markdown-ai-style/iu);
  assert.doesNotMatch(context, /karpathy-guidelines|systematic-debugging|\$HOME\/\.agents\/skills/iu);
});

test("malformed input fails open", () => {
  const result = spawnSync(process.execPath, [entry], { input: "not-json", encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});
