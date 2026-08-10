import assert from "node:assert/strict";
import test from "node:test";
import { createPreset } from "../eslint/preset.mjs";
import rule from "../eslint/local-rules/artifact-unit-owner.mjs";

test("video preset makes the owner rule mandatory for visual units", () => {
  const preset = createPreset({ parser: {} });
  assert.equal(preset[0].rules["artifact-guard/artifact-unit-owner"], "error");
  assert.match(preset[0].files[0], /visual/u);
  assert.equal(typeof rule.create, "function");
});

test("owner rule rejects an aliased Audio import at the AST seam", () => {
  const reports = [];
  const listeners = rule.create({ report(value) { reports.push(value); } });
  const node = {
    type: "ImportDeclaration",
    source: { value: "remotion" },
    specifiers: [{ type: "ImportSpecifier", imported: { name: "Audio" }, local: { name: "Sound" } }],
  };

  listeners.ImportDeclaration(node);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "owner");
});
