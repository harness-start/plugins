import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { runHook as ciHook } from "../src/domains/ci/entries/hooks/ci-gated-delivery.js";
import { main as postHook } from "../src/domains/git/entries/hooks/git-delivery-hook-post-tool.js";
import { main as preHook } from "../src/domains/git/entries/hooks/git-delivery-hook-pre-tool.js";
import { main as promptHook } from "../src/domains/git/entries/hooks/git-delivery-hook-user-prompt.js";
import { main as stopHook } from "../src/domains/git/entries/hooks/git-delivery-hook-stop.js";
import { runPreToolUse as historyHook } from "../src/domains/history/entries/hooks/repository-history-migration.js";

test("git hook implementations are import-safe owner handlers", () => {
  for (const hook of [ciHook, postHook, preHook, promptHook, stopHook, historyHook]) assert.equal(typeof hook, "function");
  for (const name of [
    "git-delivery-hook-post-tool.ts",
    "git-delivery-hook-pre-tool.ts",
    "git-delivery-hook-user-prompt.ts",
    "git-delivery-hook-stop.ts",
  ]) {
    const source = readFileSync(resolve(import.meta.dirname, "../src/domains/git/entries/hooks", name), "utf8");
    assert.doesNotMatch(source, /\nmain\(\)\.catch/u);
  }
});
