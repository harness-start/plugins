import assert from "node:assert/strict";
import { test } from "node:test";

import { commandMentionsRoot, isGenericMutationCommand, pathUnderRoot } from "@harness/core/path-protect";

test("path and command protect helpers stay path-aware", () => {
  assert.equal(pathUnderRoot("/repo/.audit/sessions/a.jsonl", "/repo/.audit"), true);
  assert.equal(pathUnderRoot("/repo/src/a.ts", "/repo/.audit"), false);
  assert.equal(pathUnderRoot("/repo", "/repo/.audit"), false);
  assert.equal(commandMentionsRoot("rm -rf .audit/sessions", ".audit", "/repo/.audit"), true);
  assert.equal(isGenericMutationCommand("cat .audit/sessions/a.jsonl"), false);
  assert.equal(isGenericMutationCommand("rm -rf .audit"), true);
});
