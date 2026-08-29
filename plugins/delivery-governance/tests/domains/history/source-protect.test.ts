import assert from "node:assert/strict";
import { test } from "node:test";
import { classifySourceProtectCommand } from "../../../src/domains/history/source-protect.ts";

test("allows the plugin execute CLI and ordinary read-only git", () => {
  assert.equal(classifySourceProtectCommand("node dist/cli/harness.mjs migration execute --source /src --target /dst"), null);
  assert.equal(classifySourceProtectCommand("git status"), null);
  assert.equal(classifySourceProtectCommand("git log --oneline"), null);
});

test("denies source-mutating history rewrite and force push", () => {
  const filter = classifySourceProtectCommand("git filter-repo --path packages/widget");
  assert.ok(filter);
  assert.equal(filter.id, "SOURCE_FILTER_REPO");
  assert.match(filter.reason, /filter-repo/u);

  const reset = classifySourceProtectCommand("git reset --hard HEAD");
  assert.ok(reset);
  assert.equal(reset.id, "SOURCE_RESET_HARD");

  const force = classifySourceProtectCommand("git push --force origin main");
  assert.ok(force);
  assert.equal(force.id, "SOURCE_FORCE_PUSH");
});

test("denies wrapped filter-repo and force-with-f short flag", () => {
  assert.equal(classifySourceProtectCommand("sudo git filter-repo --invert-paths")?.id, "SOURCE_FILTER_REPO");
  assert.equal(classifySourceProtectCommand("git push -f origin main")?.id, "SOURCE_FORCE_PUSH");
  assert.equal(classifySourceProtectCommand("git push --force-with-lease origin main")?.id, "SOURCE_FORCE_PUSH");
});

test("does not let an execute CLI mention hide a chained destructive Git command", () => {
  const finding = classifySourceProtectCommand(
    "node dist/cli/harness.mjs migration execute --source /src --target /dst && git reset --hard HEAD",
  );
  assert.equal(finding?.id, "SOURCE_RESET_HARD");
});

test("recovery points to the unified owner CLI", () => {
  const finding = classifySourceProtectCommand("git filter-repo --path packages/widget");
  assert.match(finding?.recovery ?? "", /dist\/cli\/harness\.mjs migration execute/u);
});

test("returns null for empty or unparseable commands", () => {
  assert.equal(classifySourceProtectCommand(""), null);
  assert.equal(classifySourceProtectCommand("   "), null);
});
