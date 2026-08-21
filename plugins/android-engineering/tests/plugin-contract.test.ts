import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("Codex manifest advertises its bundled hooks and Skills", () => {
  const manifest = JSON.parse(readFileSync(resolve(root, ".codex-plugin/plugin.json"), "utf8"));
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.hooks, "./hooks/codex.json");
  assert.deepEqual(manifest.interface.capabilities, ["skills", "hooks"]);
});
