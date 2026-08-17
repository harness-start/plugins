import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyDefaultBranchPublish, ciGatedSessionContext } from "../src/merge-protect.ts";

test("session context names the state machine and does not claim CI proof", () => {
  const context = ciGatedSessionContext();
  assert.match(context, /ci-gated-mr-workflow/u);
  assert.match(context, /head SHA/iu);
  assert.doesNotMatch(context, /pipeline is green|proves CI|CI 已通过/iu);
  assert.doesNotMatch(context, /Stop Hook/iu);
});

test("allows merge and default-branch push when a head SHA is bound", () => {
  assert.equal(classifyDefaultBranchPublish("gh pr merge --match-head-commit 1a2b3c4d5e6f7890"), null);
  assert.equal(classifyDefaultBranchPublish("glab mr merge --sha abcdef0"), null);
  assert.equal(classifyDefaultBranchPublish("git push origin 1a2b3c4:main"), null);
  assert.equal(classifyDefaultBranchPublish("git status"), null);
});

test("denies default-branch merge or push without a bound SHA", () => {
  assert.equal(classifyDefaultBranchPublish("gh pr merge")?.id, "MERGE_SHA_REQUIRED");
  assert.equal(classifyDefaultBranchPublish("glab mr merge 12")?.id, "MERGE_SHA_REQUIRED");
  assert.equal(classifyDefaultBranchPublish("git push origin main")?.id, "PUSH_SHA_REQUIRED");
  assert.equal(classifyDefaultBranchPublish("git push origin master")?.id, "PUSH_SHA_REQUIRED");
});

test("fails open on empty input", () => {
  assert.equal(classifyDefaultBranchPublish(""), null);
});
