import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { assertModuleRoutedOnBothHosts } from "../../../../../core/tests/support/aio-routes.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const text = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("owner routes the private presentation module on both hosts", () => {
  assertModuleRoutedOnBothHosts(import.meta.url, "presentation");
});

test("orchestrator declares the complete writer sequence and strict worker boundaries", () => {
  const skill = text("skills/pptx-deck-authoring/SKILL.md");
  for (const name of ["project-init.mjs", "project-lint.mjs", "project-render.mjs", "project-probe.mjs", "project-review.mjs", "project-release.mjs"]) assert.match(skill, new RegExp(name.replace(".", "\\."), "u"));
  assert.match(skill, /differ from the rendering and release sessions/u);
  assert.match(skill, /do not use for editing an existing PPTX or template/u);
  assert.equal(existsSync(join(ROOT, "skills/pptx-deck-review/SKILL.md")), true);
});

test("first-party advisors are bundled and have no release authority", () => {
  assert.equal(existsSync(join(ROOT, "skill-deps.json")), false);
  for (const name of ["presentation-storyboard", "presentation-visual-critique"]) {
    const skill = text(`skills/${name}/SKILL.md`);
    assert.match(skill, new RegExp(`^name:\\s*${name}$`, "mu"));
    assert.match(skill, /no .*writer|read-only|只读|cannot write|no .*release authority/iu);
  }
  assert.doesNotMatch(text("skills/pptx-deck-authoring/references/skill-composition.md"), /anthropic/iu);
});
