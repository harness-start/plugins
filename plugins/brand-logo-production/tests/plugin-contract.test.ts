import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const json = (path: string) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const text = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("both manifests expose the bundled authoring and independent review skills", () => {
  for (const platform of [".claude-plugin", ".codex-plugin"]) {
    const manifest = json(`${platform}/plugin.json`);
    assert.equal(manifest.version, "0.4.0");
    assert.equal(manifest.skills, "./skills/");
  }
  assert.deepEqual(json(".codex-plugin/plugin.json").interface.capabilities, ["skills", "hooks"]);
  assert.equal(existsSync(join(ROOT, "skills/logo-project-authoring/SKILL.md")), true);
  assert.equal(existsSync(join(ROOT, "skills/logo-project-review/SKILL.md")), true);
});

test("first-party adviser pool is bundled, bilingual, and authority-free", () => {
  assert.equal(existsSync(join(ROOT, "skill-deps.json")), false);
  const names = ["logo-brand-direction", "logo-form-language", "logo-color-accessibility"];
  for (const name of names) {
    const skill = text(`skills/${name}/SKILL.md`);
    assert.match(skill, new RegExp(`^name:\\s*${name}$`, "mu"));
    assert.match(skill, /no .*writer|read-only|只读|cannot write|no .*review.*release authority/iu);
  }
  assert.equal(existsSync(join(ROOT, "licenses", "color-expert", "NOTICE.md")), true);
  assert.match(text("licenses/color-expert/NOTICE.md"), /CC-BY-4\.0/u);
});

test("orchestrator declares the complete phase chain and registered writers", () => {
  const skill = text("skills/logo-project-authoring/SKILL.md");
  assert.match(skill, /brief[^\n]*concept[^\n]*master[^\n]*construction[^\n]*variants[^\n]*preview[^\n]*review[^\n]*release/iu);
  for (const writer of ["project-advice.mjs", "project-render.mjs", "project-preview.mjs", "project-review.mjs", "project-release.mjs"]) assert.match(skill, new RegExp(writer.replace(".", "\\."), "u"));
  assert.match(skill, /at most three|最多 3/iu);
  assert.match(skill, /bundled companion Skills.*no project writer, review, or release authority/iu);
  assert.match(skill, /Never substitute a similarly named Skill exposed by the runtime/iu);
});
