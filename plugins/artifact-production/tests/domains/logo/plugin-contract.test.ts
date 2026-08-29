import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { assertModuleRoutedOnBothHosts } from "../../../../../core/tests/support/aio-routes.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const text = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("owner routes the private module and its authoring and review skills stay bundled", () => {
  assertModuleRoutedOnBothHosts(import.meta.url, "logo");
  assert.equal(existsSync(join(ROOT, "skills/logo-project-authoring/SKILL.md")), true);
  assert.equal(existsSync(join(ROOT, "skills/logo-project-review/SKILL.md")), true);
});

test("independent review documents transcript-bound Codex identity", () => {
  const skill = text("skills/logo-project-review/SKILL.md");
  const contract = text("skills/logo-project-review/references/review-contract.md");
  for (const value of [skill, contract]) {
    assert.match(value, /CODEX_THREAD_ID/u);
    assert.match(value, /transcriptPath/u);
    assert.match(value, /CODEX_SESSION_ID/u);
  }
});

test("brand direction adviser specifies core, structural roles, and scenarios", () => {
  const skill = text("skills/logo-brand-direction/SKILL.md");
  assert.match(skill, /core token/iu);
  assert.match(skill, /structural roles/iu);
  assert.match(skill, /scenarios/iu);
});

test("first-party role adviser pool is bundled, bilingual, authority-free, and reference-complete", () => {
  assert.equal(existsSync(join(ROOT, "skill-deps.json")), false);
  const names = ["logo-brand-direction", "logo-form-language", "logo-color-accessibility", "logo-presentation-system"];
  for (const name of names) {
    const skill = text(`skills/${name}/SKILL.md`);
    assert.match(skill, new RegExp(`^name:\\s*${name}$`, "mu"));
    assert.match(skill, /no .*writer|read-only|只读|cannot write|no .*review.*release authority/iu);
    for (const match of skill.matchAll(/\]\((references\/[^)#]+)(?:#[^)]+)?\)/gu)) {
      assert.equal(existsSync(join(ROOT, `skills/${name}`, match[1])), true, `${name} has missing local reference ${match[1]}`);
    }
  }
  assert.equal(existsSync(join(ROOT, "licenses", "color-expert", "NOTICE.md")), true);
  assert.match(text("licenses/color-expert/NOTICE.md"), /CC-BY-4\.0/u);
});

test("orchestrator declares the complete phase chain and registered writers", () => {
  const skill = text("skills/logo-project-authoring/SKILL.md");
  assert.match(skill, /brief[^\n]*concept[^\n]*master[^\n]*construction[^\n]*variants[^\n]*preview[^\n]*review[^\n]*release/iu);
  for (const action of ["advice", "render", "preview", "review", "release"]) assert.match(skill, new RegExp(`harness\\.mjs logo ${action}`, "u"));
  assert.match(skill, /at most three|最多 3/iu);
  assert.match(skill, /bundled companion Skills.*no project writer, review, or release authority/iu);
  assert.match(skill, /Never substitute a similarly named Skill exposed by the runtime/iu);
  for (const route of ["symbolic", "typographic", "monogram", "negative-space", "geometric", "narrative"]) assert.match(skill, new RegExp(route, "iu"));
  assert.match(skill, /explore at least three/iu);
  assert.match(skill, /reject.*rationale/iu);
  assert.match(skill, /Fibonacci.*optional|斐波那契.*可选/iu);
  assert.match(skill, /Figma.*fallback|Figma.*回退/iu);
});
