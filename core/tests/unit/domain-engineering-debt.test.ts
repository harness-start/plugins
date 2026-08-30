import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("domain debt state stays in a focused module without expanding the Hook engine past its legacy ratchet", () => {
  const sourceRoot = resolve(import.meta.dirname, "../../src");
  const hookPath = resolve(sourceRoot, "domain-engineering-hook.ts");
  assert.equal(existsSync(resolve(sourceRoot, "domain-engineering-debt.ts")), true);
  assert.ok(readFileSync(hookPath, "utf8").split("\n").length <= 696);
});
