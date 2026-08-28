import assert from "node:assert/strict";
import test from "node:test";
import { createPreset } from "../src/lib/eslint/preset.js";
import rule from "../src/lib/eslint/local-rules/artifact-unit-owner.js";

test("PPTX preset makes the owner rule mandatory for slide modules", () => {
  const preset = createPreset({ parser: {} });
  assert.equal(preset[0].rules["artifact-guard/artifact-unit-owner"], "error");
  assert.match(preset[0].files[0], /slides/u);
  assert.equal(typeof rule.create, "function");
});
