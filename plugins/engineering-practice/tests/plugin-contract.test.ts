import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

test("publishes a standalone engineering-practice plugin", () => {
  for (const host of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    const manifest = json(host);
    assert.equal(manifest.name, "engineering-practice");
    assert.equal("dependencies" in manifest, false);
  }
  assert.equal("skills" in json(".claude-plugin/plugin.json"), false);
});

test("declares only current-source engineering community Skills", () => {
  const deps = json("skill-deps.json").skills;
  assert.deepEqual(deps.map((item: { name: string }) => item.name), [
    "karpathy-guidelines", "systematic-debugging", "verification-before-completion",
  ]);
  assert.ok(deps.every((item: { required: boolean }) => !Object.hasOwn(item, "revision") && item.required));
});
