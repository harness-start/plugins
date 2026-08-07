import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG, resolveConfig } from "../scripts/lib/config.mjs";

test("empty configuration resolves to the strict Chinese defaults", () => {
  assert.deepEqual(resolveConfig({}), {
    ...DEFAULT_CONFIG,
    detection: { ...DEFAULT_CONFIG.detection },
  });
});

test("configuration selects a profile, surface modes, and bounded thresholds", () => {
  assert.deepEqual(resolveConfig({
    defaultProfile: "th-TH",
    toolFeedback: "off",
    stop: "off",
    detection: { minScriptCharacters: 20, minLetterRatio: 0.5 },
  }), {
    defaultProfile: "th-TH",
    toolFeedback: "off",
    stop: "off",
    detection: { minScriptCharacters: 20, minLetterRatio: 0.5 },
  });
});

for (const source of [
  { defaultProfile: "fr-FR" },
  { toolFeedback: "block" },
  { stop: "report" },
  { detection: { minScriptCharacters: 0 } },
  { detection: { minLetterRatio: 2 } },
  { callback: () => true },
]) {
  test(`invalid configuration fails closed: ${Object.keys(source)[0]}`, () => {
    assert.throws(() => resolveConfig(source));
  });
}
