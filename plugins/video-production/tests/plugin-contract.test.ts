import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { VIDEO_PROFILES, VIDEO_STAGES } from "../src/lib/contract.js";

const readJson = (relativePath: string): unknown => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

test("plugin publishes shot-aware authoring and independent review skills on both hosts", () => {
  const codex = readJson("../.codex-plugin/plugin.json") as Record<string, unknown>;
  const claude = readJson("../.claude-plugin/plugin.json") as Record<string, unknown>;

  assert.equal(codex.version, "0.5.0");
  assert.equal(claude.version, "0.5.0");
  assert.equal(codex.skills, "./skills/");
  assert.equal(claude.skills, "./skills/");
  assert.match(readFileSync(new URL("../skills/video-project-authoring/SKILL.md", import.meta.url), "utf8"), /project-admit\.mjs/u);
  assert.match(readFileSync(new URL("../skills/video-project-review/SKILL.md", import.meta.url), "utf8"), /project-review\.mjs/u);
  assert.match(readFileSync(new URL("../skills/video-shot-recipes/SKILL.md", import.meta.url), "utf8"), /project-shot-stage\.mjs/u);
  assert.equal(existsSync(new URL("../licenses/video-shotcraft/LICENSE", import.meta.url)), true);
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
  const root = new URL("..", import.meta.url);
  assert.equal(existsSync(new URL("skill-deps.json", root)), false);
  for (const name of ["video-motion-direction", "video-format-playbooks", "video-visual-critique", "video-media-import", "video-shot-recipes"]) {
    const skill = readFileSync(new URL(`skills/${name}/SKILL.md`, root), "utf8");
    assert.match(skill, new RegExp(`^name:\\s*${name}$`, "mu"));
  }
  const authoring = readFileSync(new URL("../skills/video-project-authoring/SKILL.md", import.meta.url), "utf8");
  const composition = readFileSync(new URL("../skills/video-project-authoring/references/skill-composition.md", import.meta.url), "utf8");
  const body = `${authoring}\n${composition}`;
  for (const banned of ["gemini-tts", "chengfeng-cut", "chengfeng-subtitle", "seedance-storyboard", "model-selector", "prompt-translator"]) {
    assert.doesNotMatch(body, new RegExp(banned, "u"));
  }
});
