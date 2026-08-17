import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

test("publishes a standalone professional-writing plugin", () => {
  for (const host of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    const manifest = json(host);
    assert.equal(manifest.name, "professional-writing");
    assert.equal("dependencies" in manifest, false);
    assert.equal(manifest.skills, "./skills/");
  }
  assert.equal(existsSync(resolve(root, "skill-deps.json")), false);
  for (const skill of ["writing-terse-output", "writing-english-prose", "writing-chinese-prose", "writing-markdown-ai-style", "ai-flavor-remover"]) {
    assert.equal(existsSync(resolve(root, "skills", skill, "SKILL.md")), true, skill);
  }
});
