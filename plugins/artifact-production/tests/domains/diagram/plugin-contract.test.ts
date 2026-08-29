import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { assertModuleRoutedOnBothHosts } from "../../../../../core/tests/support/aio-routes.js";

test("keeps the diagram workflow private, routed, and self-contained", () => {
  assertModuleRoutedOnBothHosts(import.meta.url, "diagram");
  for (const name of ["diagram-project-authoring", "diagram-visual-critique", "diagram-project-review"]) assert.equal(existsSync(new URL(`../../../skills/${name}/SKILL.md`, import.meta.url)), true);
  assert.equal(existsSync(new URL("../../../skill-deps.json", import.meta.url)), false);
  assert.equal(existsSync(new URL("../../../vendor-skills", import.meta.url)), false);
});

test("authoring Skill documents every registered writer and the artifact root", () => {
  const skill = readFileSync(new URL("../../../skills/diagram-project-authoring/SKILL.md", import.meta.url), "utf8");
  for (const action of ["init", "import", "lint", "render", "probe", "review", "release"]) assert.match(skill, new RegExp(`harness\\.mjs diagram ${action}`, "u"));
  assert.match(skill, /artifacts\/diagram\/<id>/u);
});
