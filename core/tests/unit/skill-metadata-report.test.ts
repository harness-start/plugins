import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

import type { SkillMetadataReport } from "../../../scripts/report-skill-metadata.js";

const root = resolve(import.meta.dirname, "../../..");
const targetPlugins = [
  "brand-logo-production",
  "poster-production",
  "video-production",
  "music-production",
];

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
    totalSkills: 25,
    implicitSkills: 25,
    explicitOnlySkills: 0,
    approxImplicitTokens: catalog.totals.approxImplicitTokens,
  });
  assert.ok(catalog.totals.approxImplicitTokens <= 1_600, String(catalog.totals.approxImplicitTokens));

  for (const plugin of catalog.plugins) {
    assert.equal(plugin.implicitSkills, plugin.totalSkills, plugin.name);
    assert.equal(plugin.explicitOnlySkills, 0, plugin.name);
    assert.equal(plugin.skills.every((skill) => skill.descriptionCharacters <= 160), true, plugin.name);
    assert.equal(plugin.skills.every((skill) => !/\p{Script=Han}/u.test(skill.description)), true, plugin.name);
  }
});

test("the compact catalog preserves every bundled companion", () => {
  const catalog = report();
  const expectedCompanions = new Map<string, string[]>([
    ["brand-logo-production", ["logo-brand-direction", "logo-color-accessibility", "logo-form-language", "logo-presentation-system"]],
    ["poster-production", ["poster-academic", "poster-mondo", "poster-regional-culture", "poster-visual-critique"]],
    ["video-production", ["video-format-playbooks", "video-media-import", "video-motion-direction", "video-shot-recipes", "video-visual-critique"]],
    ["music-production", ["music-composition-method", "music-genre-reference", "music-mix-qc", "music-reference-profile"]],
  ]);

  for (const plugin of catalog.plugins) {
    const projectPrefix = plugin.name === "brand-logo-production" ? "logo" : plugin.name.split("-")[0];
    const projectSkills = [`${projectPrefix}-project-authoring`, `${projectPrefix}-project-review`];
    assert.deepEqual(plugin.skills.map((skill) => skill.name).toSorted(), [
      ...(expectedCompanions.get(plugin.name) ?? []),
      ...projectSkills,
    ].toSorted(), plugin.name);
  }
});
