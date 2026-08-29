import assert from "node:assert/strict";
import test from "node:test";
import { createPreset } from "../../../src/domains/print/lib/eslint/preset.js";
import rule from "../../../src/domains/print/lib/eslint/local-rules/artifact-unit-owner.js";

test("print preset makes the owner rule mandatory for publication units", () => {
  const preset = createPreset({ parser: {} });
  assert.equal(preset[0].rules["artifact-guard/artifact-unit-owner"], "error");
  assert.match(preset[0].files[0], /sections/u);
  assert.equal(typeof rule.create, "function");
});
