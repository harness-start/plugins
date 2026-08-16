import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("poster skill dependencies are exact read-only advisors", () => {
  const deps = readJson("../skill-deps.json");
  assert.deepEqual(deps.skills.map(({ name }: { name: string }) => name), [
    "regional-culture-poster",
    "qiaomu-mondo-poster-design",
    "cvpr-2026-poster",
    "impeccable",
  ]);
  for (const dependency of deps.skills) {
    assert.match(dependency.revision, /^[a-f0-9]{40}$/u);
    assert.match(dependency.description, /read-only|只读/iu);
  }
});
