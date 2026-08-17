import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

test("publishes a standalone engineering-practice plugin", () => {
  for (const host of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    const manifest = json(host);
    assert.equal(manifest.name, "engineering-practice");
    assert.equal("dependencies" in manifest, false);
    assert.equal(manifest.skills, "./skills/");
  }
  assert.equal(existsSync(resolve(root, "skill-deps.json")), false);
  for (const skill of ["engineering-practice", "engineering-judgment", "engineering-debugging", "engineering-verification"]) {
    assert.equal(existsSync(resolve(root, "skills", skill, "SKILL.md")), true, skill);
  }
});
