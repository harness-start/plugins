import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { VIDEO_PROFILES, VIDEO_STAGES } from "../src/lib/contract.js";

const readJson = (relativePath: string): unknown => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

test("plugin publishes one authoring orchestrator and one independent review skill on both hosts", () => {
  const codex = readJson("../.codex-plugin/plugin.json") as Record<string, unknown>;
  const claude = readJson("../.claude-plugin/plugin.json") as Record<string, unknown>;

  assert.equal(codex.version, "0.4.0");
  assert.equal(claude.version, "0.4.0");
  assert.equal(codex.skills, "./skills/");
  assert.equal(claude.skills, "./skills/");
  assert.match(readFileSync(new URL("../skills/video-project-authoring/SKILL.md", import.meta.url), "utf8"), /project-admit\.mjs/u);
  assert.match(readFileSync(new URL("../skills/video-project-review/SKILL.md", import.meta.url), "utf8"), /project-review\.mjs/u);
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

test("video skill dependencies pin every executable companion to an exact revision", () => {
  const deps = readJson("../skill-deps.json") as { skills?: Array<Record<string, unknown>> };

  assert.ok(Array.isArray(deps.skills));
  assert.ok(deps.skills.length >= 10);
  for (const dependency of deps.skills) {
    assert.match(String(dependency.revision), /^[a-f0-9]{40}$/u);
    assert.ok(["advisor", "external-runner"].includes(String(dependency.mode)));
  }
});
