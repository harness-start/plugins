import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyDefaultBranchPublish } from "../src/merge-protect.ts";

test("allows merge and default-branch push when a head SHA is bound", () => {
  assert.equal(classifyDefaultBranchPublish("gh pr merge --match-head-commit 1a2b3c4d5e6f7890"), null);
  assert.equal(classifyDefaultBranchPublish("glab mr merge --sha abcdef0"), null);
  assert.equal(classifyDefaultBranchPublish("git push origin 1a2b3c4:main"), null);
  assert.equal(classifyDefaultBranchPublish("git push origin 1a2b3c4:refs/heads/main"), null);
  assert.equal(classifyDefaultBranchPublish("git status"), null);
});

test("denies default-branch merge or push without a bound SHA", () => {
  assert.equal(classifyDefaultBranchPublish("gh pr merge")?.id, "MERGE_SHA_REQUIRED");
  assert.equal(classifyDefaultBranchPublish("glab mr merge 12")?.id, "MERGE_SHA_REQUIRED");
  assert.equal(classifyDefaultBranchPublish("git push origin main")?.id, "PUSH_SHA_REQUIRED");
  assert.equal(classifyDefaultBranchPublish("git push origin master")?.id, "PUSH_SHA_REQUIRED");
  assert.equal(
    classifyDefaultBranchPublish("git push origin HEAD:refs/heads/main")?.id,
    "PUSH_SHA_REQUIRED",
  );
});

test("denies an unrelated hex token that does not bind the protected invocation", () => {
  assert.equal(
    classifyDefaultBranchPublish("echo deadbeef && gh pr merge")?.id,
    "MERGE_SHA_REQUIRED",
  );
  assert.equal(
    classifyDefaultBranchPublish("gh pr merge --subject deadbeef")?.id,
    "MERGE_SHA_REQUIRED",
  );
  assert.equal(
    classifyDefaultBranchPublish("git push origin main --push-option=deadbeef")?.id,
    "PUSH_SHA_REQUIRED",
  );
});

test("fails open on empty input", () => {
  assert.equal(classifyDefaultBranchPublish(""), null);
});
