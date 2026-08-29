import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import type {} from "../src/entries/hooks/dispatcher.js";

const root = resolve(import.meta.dirname, "..");

test("knowledge-work exposes one self-contained AIO entrypoint", () => {
  for (const host of ["claude", "codex"]) {
    assert.ok(existsSync(resolve(root, `.${host}-plugin/plugin.json`)));
    const hooks = JSON.parse(readFileSync(resolve(root, "hooks", `${host}.json`), "utf8"));
    assert.equal(typeof hooks.hooks, "object");
  }
  assert.ok(existsSync(resolve(root, "src/entries/hooks/dispatcher.ts")));
  const dispatcher = readFileSync(resolve(root, "src/entries/hooks/dispatcher.ts"), "utf8");
  assert.match(dispatcher, /runOwnerDispatcher/u);
  assert.doesNotMatch(dispatcher, /runAioDispatcher/u);
});
