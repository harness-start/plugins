import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

import type { SkillMetadataReport } from "../../../scripts/report-skill-metadata.js";

const root = resolve(import.meta.dirname, "../../..");
const targetPlugins = ["artifact-production"];

type SkillReport = {
  name: string;
  implicit: boolean;
  descriptionCharacters: number;
};

type PluginReport = {
  name: string;
  totalSkills: number;
  implicitSkills: number;
  explicitOnlySkills: number;
  approxImplicitTokens: number;
  skills: SkillReport[];
};

type CatalogReport = SkillMetadataReport & { plugins: PluginReport[] };

function report(): CatalogReport {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/report-skill-metadata.ts", "--json", ...targetPlugins],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout) as CatalogReport;
}

test("artifact-production catalogs keep every bundled skill discoverable with bounded metadata", () => {
  const catalog = report();
  assert.equal(catalog.schema, "harness-start/skill-metadata-report/v1");
  assert.deepEqual(catalog.totals, {
    totalSkills: 34,
    implicitSkills: 34,
    explicitOnlySkills: 0,
    approxImplicitTokens: catalog.totals.approxImplicitTokens,
  });
  assert.ok(catalog.totals.approxImplicitTokens <= 2_400, String(catalog.totals.approxImplicitTokens));

  for (const plugin of catalog.plugins) {
    assert.equal(plugin.implicitSkills, plugin.totalSkills, plugin.name);
    assert.equal(plugin.explicitOnlySkills, 0, plugin.name);
    assert.equal(plugin.skills.every((skill) => skill.descriptionCharacters <= 360), true, plugin.name);
    assert.equal(plugin.skills.every((skill) => skill.description.trim().length > 0), true, plugin.name);
  }
});

test("the compact catalog preserves every bundled companion", () => {
  const catalog = report();
  const skillNames = new Set(catalog.plugins[0]?.skills.map((skill) => skill.name));
  for (const name of [
    "logo-brand-direction", "logo-project-authoring", "logo-project-review",
    "poster-academic", "poster-project-authoring", "poster-project-review",
    "video-format-playbooks", "video-project-authoring", "video-project-review", "video-shot-recipes",
    "music-composition-method", "music-project-authoring", "music-project-review",
    "diagram-project-authoring", "pptx-deck-authoring", "training-program-design",
  ]) assert.equal(skillNames.has(name), true, name);
});
