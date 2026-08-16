import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const json = (path: string) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const text = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("both plugin manifests expose bundled authoring and review skills", () => {
  for (const platform of [".claude-plugin", ".codex-plugin"]) {
    const manifest = json(`${platform}/plugin.json`);
    assert.equal(manifest.version, "0.3.0");
    assert.equal(manifest.skills, "./skills/");
    assert.equal(manifest.hooks, `./hooks/${platform === ".codex-plugin" ? "codex" : "claude"}.json`);
  }
  assert.deepEqual(json(".codex-plugin/plugin.json").interface.capabilities, ["skills", "hooks"]);
});

test("orchestrator declares the complete writer sequence and strict worker boundaries", () => {
  const skill = text("skills/pptx-deck-authoring/SKILL.md");
  for (const name of ["project-init.mjs", "project-lint.mjs", "project-render.mjs", "project-probe.mjs", "project-review.mjs", "project-release.mjs"]) assert.match(skill, new RegExp(name.replace(".", "\\."), "u"));
  assert.match(skill, /differ from the rendering and release sessions/u);
  assert.match(skill, /do not use for editing an existing PPTX or template/u);
  assert.equal(existsSync(join(ROOT, "skills/pptx-deck-review/SKILL.md")), true);
});

test("external dependencies are revision-pinned advisers without release authority", () => {
  const dependencies = json("skill-deps.json").skills;
  assert.deepEqual(dependencies.map(({ name }: { name: string }) => name), ["pptx-generator", "impeccable"]);
  assert.equal(dependencies[0].revision, "4006c2661305ed221f957a08e1d3429cb525de67");
  assert.equal(dependencies[1].revision, "5a149f3fdb1b5793f10567233b1dcab98fc305fd");
  for (const dependency of dependencies) assert.match(dependency.description, /no .*release authority/iu);
  assert.doesNotMatch(JSON.stringify(dependencies), /anthropic/iu);
});
