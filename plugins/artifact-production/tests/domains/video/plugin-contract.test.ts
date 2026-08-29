import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { assertModuleRoutedOnBothHosts } from "../../../../../core/tests/support/aio-routes.js";
import { VIDEO_PROFILES, VIDEO_STAGES } from "../../../src/domains/video/lib/contract.js";

test("owner routes the private video module and its production skills stay bundled", () => {
  assertModuleRoutedOnBothHosts(import.meta.url, "video");
  assert.match(readFileSync(new URL("../../../skills/video-project-authoring/SKILL.md", import.meta.url), "utf8"), /harness\.mjs video admit/u);
  assert.match(readFileSync(new URL("../../../skills/video-project-review/SKILL.md", import.meta.url), "utf8"), /harness\.mjs video review/u);
  assert.match(readFileSync(new URL("../../../skills/video-shot-recipes/SKILL.md", import.meta.url), "utf8"), /harness\.mjs video shot-stage/u);
  assert.equal(existsSync(new URL("../../../licenses/video-shotcraft/LICENSE", import.meta.url)), true);
});

test("video v2 contract publishes six production profiles and the staged delivery closure", () => {
  assert.deepEqual(VIDEO_PROFILES, [
    "motion-explainer",
    "product-promo",
    "short-form",
    "talking-head",
    "reference-led",
    "micro-drama",
  ]);
  assert.deepEqual(VIDEO_STAGES, [
    "source",
    "direction",
    "storyboard",
    "assets",
    "composition",
    "render",
    "probe",
    "review",
    "release",
  ]);
});

test("video first-party workers are bundled and drop Key/URL runners", () => {
  const root = new URL("../../../", import.meta.url);
  assert.equal(existsSync(new URL("skill-deps.json", root)), false);
  for (const name of ["video-motion-direction", "video-format-playbooks", "video-visual-critique", "video-media-import", "video-shot-recipes"]) {
    const skill = readFileSync(new URL(`skills/${name}/SKILL.md`, root), "utf8");
    assert.match(skill, new RegExp(`^name:\\s*${name}$`, "mu"));
  }
  const authoring = readFileSync(new URL("../../../skills/video-project-authoring/SKILL.md", import.meta.url), "utf8");
  const composition = readFileSync(new URL("../../../skills/video-project-authoring/references/skill-composition.md", import.meta.url), "utf8");
  const body = `${authoring}\n${composition}`;
  for (const banned of ["gemini-tts", "chengfeng-cut", "chengfeng-subtitle", "seedance-storyboard", "model-selector", "prompt-translator"]) {
    assert.doesNotMatch(body, new RegExp(banned, "u"));
  }
});
