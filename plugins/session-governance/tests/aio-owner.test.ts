import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");

test("session-governance exposes one self-contained AIO entrypoint", () => {
  for (const host of ["claude", "codex"]) {
    assert.ok(existsSync(resolve(root, `.${host}-plugin/plugin.json`)));
    const hooks = JSON.parse(readFileSync(resolve(root, "hooks", `${host}.json`), "utf8"));
    assert.equal(typeof hooks.hooks, "object");
  }
  assert.ok(existsSync(resolve(root, "src/entries/hooks/dispatcher.ts")));
});
