import assert from "node:assert/strict";
import test from "node:test";
import { createPreset } from "../../../src/domains/logo/lib/eslint/preset.js";
import rule from "../../../src/domains/logo/lib/eslint/local-rules/artifact-unit-owner.js";

test("logo preset makes the owner rule mandatory for master modules", () => {
  const preset = createPreset({ parser: {} });
  assert.equal(preset[0].rules["artifact-guard/artifact-unit-owner"], "error");
  assert.match(preset[0].files[0], /master/u);
  assert.equal(typeof rule.create, "function");
});
