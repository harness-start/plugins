import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

test("publishes a standalone professional-writing plugin", () => {
  for (const host of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    const manifest = json(host);
    assert.equal(manifest.name, "professional-writing");
    assert.equal("dependencies" in manifest, false);
  }
  assert.equal(json(".claude-plugin/plugin.json").skills, "./skills/");
});

test("declares only current-source writing community Skills", () => {
  const deps = json("skill-deps.json").skills;
  assert.deepEqual(deps.map((item: { name: string }) => item.name), [
    "caveman", "humanizer", "stop-slop", "humanizer-zh", "shuorenhua", "remove-ai-style",
  ]);
  assert.ok(deps.every((item: { required: boolean }) => !Object.hasOwn(item, "revision") && item.required));
});
