import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function json(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

test("dual-host manifests expose the same plugin and platform-scoped hooks", () => {
  const claude = json(".claude-plugin/plugin.json");
  const codex = json(".codex-plugin/plugin.json");
  assert.equal(claude.name, "work-report-insights");
  assert.equal(codex.name, claude.name);
  assert.equal(codex.version, claude.version);
  assert.equal(claude.hooks, "./hooks/claude.json");
  assert.equal(codex.hooks, undefined);
  assert.equal(codex.interface.displayName, "Work Report Insights");

  const claudeHooks = readFileSync(join(ROOT, "hooks/claude.json"), "utf8");
  const codexHooks = readFileSync(join(ROOT, "hooks/codex.json"), "utf8");
  assert.match(codexHooks, /AI_EXPERTS_SESSION_ID/u);
  assert.match(codexHooks, /AI_EXPERTS_TRIGGER_FROM/u);
  assert.doesNotMatch(codexHooks, /CLAUDE_PLUGIN_ROOT/u);
  assert.doesNotMatch(claudeHooks, /\$\{PLUGIN_ROOT\}/u);
  assert.doesNotMatch(claudeHooks, /UserPromptSubmit/u);
  assert.doesNotMatch(codexHooks, /UserPromptSubmit/u);
});

test("plugin keeps the daily skill id, adds weekly and summary skills, and declares grill-me", () => {
  const skillNames = readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(skillNames, ["daily-work-report", "weekly-work-report", "work-summary-report"]);
  assert.equal(json("skill-deps.json").skills.some((skill) => skill.name === "grill-me"), true);
  for (const skill of skillNames) {
    const content = readFileSync(join(ROOT, "skills", skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(content, /--mode\b/u);
  }
});
