import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const readJson = (relativePath: string) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

test("plugin publishes authoring and independent review skills on both hosts", () => {
  const codex = readJson("../.codex-plugin/plugin.json");
  const claude = readJson("../.claude-plugin/plugin.json");
  assert.equal(codex.version, "0.3.0");
  assert.equal(claude.version, "0.3.0");
  assert.equal(codex.hooks, "./hooks/codex.json");
  assert.equal(claude.hooks, "./hooks/claude.json");
  assert.ok(readFileSync(new URL("../skills/poster-project-authoring/SKILL.md", import.meta.url), "utf8").includes("project-render.mjs"));
  assert.ok(readFileSync(new URL("../skills/poster-project-review/SKILL.md", import.meta.url), "utf8").includes("project-review.mjs"));
  assert.equal(dirname(root).endsWith("plugins"), true);
});

test("poster first-party advisors are bundled and read-only", () => {
  assert.equal(existsSync(new URL("../skill-deps.json", import.meta.url)), false);
  for (const name of ["poster-regional-culture", "poster-mondo", "poster-academic", "poster-visual-critique"]) {
    const skill = readFileSync(new URL(`../skills/${name}/SKILL.md`, import.meta.url), "utf8");
    assert.match(skill, new RegExp(`^name:\\s*${name}$`, "mu"));
    assert.match(skill, /no .*writer|read-only|只读|cannot write/iu);
  }
});
