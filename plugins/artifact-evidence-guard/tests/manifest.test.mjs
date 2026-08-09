import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

async function json(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("dual-host manifests register the Stop verifier", async () => {
  const claudePlugin = await json(".claude-plugin/plugin.json");
  const codexPlugin = await json(".codex-plugin/plugin.json");
  const claudeHooks = await json("hooks/claude.json");
  const codexHooks = await json("hooks/codex.json");

  assert.equal(claudePlugin.name, "artifact-evidence-guard");
  assert.equal(codexPlugin.name, "artifact-evidence-guard");
  assert.match(claudeHooks.hooks.Stop[0].hooks[0].command, /artifact-evidence-guard\.mjs/u);
  assert.match(codexHooks.hooks.Stop[0].hooks[0].command, /AI_EXPERTS_SESSION_ID/u);
  assert.match(codexHooks.hooks.Stop[0].hooks[0].command, /AI_EXPERTS_TRIGGER_FROM/u);
});
