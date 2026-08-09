import assert from "node:assert/strict";
import test from "node:test";
import { createPreset } from "../eslint/preset.mjs";
import rule from "../eslint/local-rules/artifact-unit-owner.mjs";

test("poster preset makes the owner rule mandatory for layer modules", () => {
  const preset = createPreset({ parser: {} });
  assert.equal(preset[0].rules["artifact-guard/artifact-unit-owner"], "error");
  assert.match(preset[0].files[0], /layers/u);
  assert.equal(typeof rule.create, "function");
});
