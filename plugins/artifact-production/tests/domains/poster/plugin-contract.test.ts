import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { assertModuleRoutedOnBothHosts } from "../../../../../core/tests/support/aio-routes.js";

const root = resolve(import.meta.dirname, "../../..");

test("owner routes the private module and its authoring and review skills stay bundled", () => {
  assertModuleRoutedOnBothHosts(import.meta.url, "poster");
  assert.ok(readFileSync(new URL("../../../skills/poster-project-authoring/SKILL.md", import.meta.url), "utf8").includes("harness.mjs poster render"));
  assert.ok(readFileSync(new URL("../../../skills/poster-project-review/SKILL.md", import.meta.url), "utf8").includes("harness.mjs poster review"));
  assert.equal(root.endsWith("artifact-production"), true);
});

test("poster first-party advisors are bundled and read-only", () => {
  assert.equal(existsSync(new URL("../../../skill-deps.json", import.meta.url)), false);
  for (const name of ["poster-regional-culture", "poster-mondo", "poster-academic", "poster-visual-critique"]) {
    const skill = readFileSync(new URL(`../../../skills/${name}/SKILL.md`, import.meta.url), "utf8");
    assert.match(skill, new RegExp(`^name:\\s*${name}$`, "mu"));
    assert.match(skill, /no .*writer|read-only|只读|cannot write/iu);
  }
});

test("poster-mondo publishes only bundled generic read-only guidance", () => {
  const skill = readFileSync(new URL("../../../skills/poster-mondo/SKILL.md", import.meta.url), "utf8");
  assert.doesNotMatch(skill, /AI Gateway|scripts\/generate_|\/generate-image|--list-styles/iu);
  assert.doesNotMatch(skill, /(?:Olly Moss|Tyler Stout|Martin Ansin|Laurent Durieux|Jay Ryan|Kilian Eng|Shepard Fairey|Paula Scher)\s+(?:style|approach|technique)/iu);
  for (const match of skill.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
    assert.equal(existsSync(new URL(`../../../skills/poster-mondo/${match[1]}`, import.meta.url)), true, `missing poster-mondo reference: ${match[1]}`);
  }
});

test("regional culture adviser never claims direct rendering authority", () => {
  const skill = readFileSync(new URL("../../../skills/poster-regional-culture/SKILL.md", import.meta.url), "utf8");
  const direct = readFileSync(new URL("../../../skills/poster-regional-culture/references/direct-generation.md", import.meta.url), "utf8");
  assert.doesNotMatch(`${skill}\n${direct}`, /direct final generation|finished flattened poster|print-ready|direct rendered|direct deliverable/iu);
  assert.match(`${skill}\n${direct}`, /input asset|输入素材|deterministic authoring/iu);
});
