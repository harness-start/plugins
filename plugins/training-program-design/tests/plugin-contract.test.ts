import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(ROOT));
const text = (path: string) => readFileSync(join(ROOT, path), "utf8");
const json = (path: string) => JSON.parse(text(path));

test("publishes a self-contained dual-host training workflow plugin", () => {
  const claude = json(".claude-plugin/plugin.json");
  const codex = json(".codex-plugin/plugin.json");
  assert.equal(claude.name, "training-program-design");
  assert.equal(codex.name, claude.name);
  assert.equal(claude.version, "1.0.0");
  assert.equal(codex.version, claude.version);
  assert.equal(claude.hooks, "./hooks/claude.json");
  assert.equal(codex.hooks, "./hooks/codex.json");
  assert.equal(existsSync(join(ROOT, "skills", "training-program-design", "SKILL.md")), true);
  assert.equal(existsSync(join(ROOT, "skills", "training-program-review", "SKILL.md")), true);
  assert.equal(existsSync(join(ROOT, "skill-deps.json")), false);
  assert.equal(existsSync(join(ROOT, "vendor-skills")), false);
});

test("marketplaces publish the plugin exactly once", () => {
  for (const path of [
    join(REPO, ".claude-plugin", "marketplace.json"),
    join(REPO, ".agents", "plugins", "marketplace.json"),
  ]) {
    const names = JSON.parse(readFileSync(path, "utf8")).plugins.map((entry: { name: string }) => entry.name);
    assert.equal(names.filter((name: string) => name === "training-program-design").length, 1, path);
  }
});

test("skills describe the staged workflow without external skill dependencies", () => {
  const authoring = text("skills/training-program-design/SKILL.md");
  const review = text("skills/training-program-review/SKILL.md");
  for (const stage of ["brief", "design", "materials", "review", "release"]) assert.match(authoring, new RegExp(stage, "u"));
  assert.match(authoring, /artifacts\/training/u);
  assert.match(authoring, /PLUGIN_ROOT/u);
  assert.match(authoring, /CLAUDE_PLUGIN_ROOT/u);
  assert.match(review, /read-only|只读/iu);
  assert.doesNotMatch(`${authoring}\n${review}`, /skill-deps|vendor-skills|\.agents\/skills/iu);
});
