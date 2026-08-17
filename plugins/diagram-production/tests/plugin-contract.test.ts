import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const readJson = (relativePath: string) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

test("publishes the diagram workflow and three bundled Skills on both hosts", () => {
  const codex = readJson("../.codex-plugin/plugin.json");
  const claude = readJson("../.claude-plugin/plugin.json");
  assert.equal(codex.name, "diagram-production");
  assert.equal(claude.name, "diagram-production");
  assert.equal(codex.hooks, "./hooks/codex.json");
  assert.equal(claude.hooks, "./hooks/claude.json");
  for (const name of ["diagram-project-authoring", "diagram-visual-critique", "diagram-project-review"]) assert.equal(existsSync(new URL(`../skills/${name}/SKILL.md`, import.meta.url)), true);
  assert.equal(existsSync(new URL("../skill-deps.json", import.meta.url)), false);
  assert.equal(existsSync(new URL("../vendor-skills", import.meta.url)), false);
});

test("authoring Skill documents every registered writer and the artifact root", () => {
  const skill = readFileSync(new URL("../skills/diagram-project-authoring/SKILL.md", import.meta.url), "utf8");
  for (const writer of ["project-init.mjs", "project-import.mjs", "project-lint.mjs", "project-render.mjs", "project-probe.mjs", "project-review.mjs", "project-release.mjs"]) assert.match(skill, new RegExp(writer.replace(".", "\\."), "u"));
  assert.match(skill, /artifacts\/diagram\/<id>/u);
});
