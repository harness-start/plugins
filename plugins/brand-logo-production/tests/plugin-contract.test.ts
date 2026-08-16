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

test("external skill pool follows public current sources and remains bilingual and authority-free", () => {
  const dependencies = json("skill-deps.json").skills;
  assert.deepEqual(dependencies.map(({ name }: { name: string }) => name), ["brand-identity", "logo-design", "color-expert", "logo-generator"]);
  assert.ok(dependencies.every((dependency: Record<string, unknown>) => !Object.hasOwn(dependency, "revision")));
  assert.deepEqual(new Set(dependencies.map(({ ecosystem }: { ecosystem: string }) => ecosystem)), new Set(["en", "zh"]));
  for (const dependency of dependencies) {
    assert.match(dependency.source, /^https:\/\/github\.com\//u);
    assert.match(dependency.description, /no .*review.*release authority/iu);
  }
  const chineseLogo = dependencies.find(({ name }: { name: string }) => name === "logo-generator");
  assert.equal(chineseLogo.mode, "reference-only");
  assert.deepEqual(chineseLogo.allowFiles, ["SKILL.md", "references/design_patterns.md"]);
});

test("orchestrator declares the complete phase chain and registered writers", () => {
  const skill = text("skills/logo-project-authoring/SKILL.md");
  assert.match(skill, /brief[^\n]*concept[^\n]*master[^\n]*construction[^\n]*variants[^\n]*preview[^\n]*review[^\n]*release/iu);
  for (const writer of ["project-advice.mjs", "project-render.mjs", "project-preview.mjs", "project-review.mjs", "project-release.mjs"]) assert.match(skill, new RegExp(writer.replace(".", "\\."), "u"));
  assert.match(skill, /at most three|最多 3/iu);
  assert.match(skill, /external.*no.*writer.*review.*release authority/iu);
});
