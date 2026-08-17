import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  assert.equal(claude.name, "work-reporting");
  assert.equal(codex.name, claude.name);
  assert.equal(codex.version, claude.version);
  assert.equal(claude.version, "0.3.0");
  assert.equal(claude.hooks, "./hooks/claude.json");
  assert.equal(codex.hooks, "./hooks/codex.json");
  assert.equal(claude.skills, "./skills/");
  assert.equal(codex.skills, "./skills/");
  assert.equal(codex.interface.displayName, "Work Report Insights");

  const claudeHooks = readFileSync(join(ROOT, "hooks/claude.json"), "utf8");
  const codexHooks = readFileSync(join(ROOT, "hooks/codex.json"), "utf8");
  assert.match(codexHooks, /AI_EXPERTS_SESSION_ID/u);
  assert.match(codexHooks, /AI_EXPERTS_TRIGGER_FROM/u);
  assert.doesNotMatch(codexHooks, /CLAUDE_PLUGIN_ROOT/u);
  assert.doesNotMatch(claudeHooks, /\$\{PLUGIN_ROOT\}/u);
  for (const hooks of [claudeHooks, codexHooks]) {
    assert.match(hooks, /UserPromptSubmit/u);
    assert.match(hooks, /SessionStart/u);
    assert.match(hooks, /PostToolUseFailure/u);
  }
});

test("plugin exposes one orchestrator, interview method, review skill, and no community deps", () => {
  const skillNames = readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(skillNames, ["work-report-authoring", "work-report-interview", "work-report-review"]);
  assert.equal(existsSync(join(ROOT, "skill-deps.json")), false);
  for (const skill of skillNames) {
    const content = readFileSync(join(ROOT, "skills", skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(content, /--mode\b/u);
    assert.match(content, new RegExp(`^name:\\s*${skill}$`, "mu"));
  }
  const orchestrator = readFileSync(join(ROOT, "skills/work-report-authoring/SKILL.md"), "utf8");
  assert.match(orchestrator, /EvidenceBundleV2/u);
  assert.match(orchestrator, /WorkReportContractV2/u);
  assert.match(orchestrator, /prepared.*acknowledged.*saved/su);
  assert.match(orchestrator, /work-report-interview/u);
  assert.doesNotMatch(orchestrator, /\$(?:grilling|brag-sheet|growth-log|performance-review-writer)/u);
  const interview = readFileSync(join(ROOT, "skills/work-report-interview/SKILL.md"), "utf8");
  assert.match(interview, /one question|一次一问/iu);
});
