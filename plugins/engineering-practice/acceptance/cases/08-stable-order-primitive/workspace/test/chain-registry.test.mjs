import assert from "node:assert/strict";
import { test } from "node:test";

import { ChainRegistry } from "../src/chain-registry.mjs";

test("preserves the existing two-chain dependency contract", () => {
  ChainRegistry.clearWarnings();
  assert.deepEqual(ChainRegistry.combine(["prepare", "verify"], ["verify", "publish"]), [
    "prepare",
    "verify",
    "publish",
  ]);
  assert.deepEqual(ChainRegistry.warnings, []);
});

test("warns and falls back for an actual cycle", () => {
  ChainRegistry.clearWarnings();
  assert.deepEqual(ChainRegistry.combine(["first", "second"], ["second", "first"]), ["first", "second"]);
  assert.deepEqual(ChainRegistry.warnings, ["cycle in chains"]);
});
