import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("management bundle exposes proposal validation to installed-plugin acceptance", async () => {
  const runtime = await import("../dist/cli/project-capability-manage.mjs");
  assert.equal(typeof runtime.validateProposalDocument, "function");
});

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(ROOT));

function text(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function json(path) {
  return JSON.parse(text(path));
}

test("dual-host plugin contracts expose only proposal lifecycle hooks", () => {
  const codex = json(".codex-plugin/plugin.json");
  const claude = json(".claude-plugin/plugin.json");
  assert.equal(codex.name, "project-capability-governance");
  assert.equal(claude.name, codex.name);
  assert.equal(claude.version, codex.version);
  assert.equal(codex.hooks, "./hooks/codex.json");
  assert.equal(claude.hooks, "./hooks/claude.json");

  const codexHooks = text("hooks/codex.json");
  const claudeHooks = text("hooks/claude.json");
  assert.equal(existsSync(join(ROOT, "hooks", "hooks.json")), false);
  for (const event of ["SessionStart", "PreToolUse", "Stop"]) {
    assert.match(codexHooks, new RegExp(`"${event}"`, "u"));
    assert.match(claudeHooks, new RegExp(`"${event}"`, "u"));
  }
  for (const event of ["UserPromptSubmit", "SubagentStart", "SubagentStop"]) {
    assert.doesNotMatch(codexHooks, new RegExp(`"${event}"`, "u"));
    assert.doesNotMatch(claudeHooks, new RegExp(`"${event}"`, "u"));
  }
  assert.match(codexHooks, /AI_EXPERTS_SESSION_ID/u);
  assert.match(codexHooks, /AI_EXPERTS_TRIGGER_FROM/u);
  assert.doesNotMatch(codexHooks, /CLAUDE_PLUGIN_ROOT/u);
  assert.doesNotMatch(claudeHooks, /\$\{PLUGIN_ROOT\}/u);

  const stopHooks = json("hooks/codex.json").hooks.Stop.flatMap((entry) => entry.hooks ?? []);
  assert.equal(stopHooks.length > 0, true);
  for (const hook of stopHooks) {
    assert.equal(Object.hasOwn(hook, "additionalContextLimit"), false);
  }
});

test("governance skill is explicit-only and lands capabilities in project host directories", () => {
  const skill = text("skills/project-capability-governance/SKILL.md");
  const metadata = text("skills/project-capability-governance/agents/openai.yaml");
  assert.match(metadata, /allow_implicit_invocation: false/u);
  for (const path of [
    ".claude/skills/<id>/",
    ".agents/skills/<id>/",
    ".claude/settings.json",
    ".codex/hooks.json",
  ]) {
    assert.ok(skill.includes(path), path);
  }
  assert.match(skill, /one question/iu);
  assert.match(skill, /at most five/iu);
  assert.doesNotMatch(skill, /\.project-capabilities\/hooks/u);
  assert.doesNotMatch(skill, /--global/u);
});

test("both repository marketplaces publish the new plugin", () => {
  const codexMarketplace = JSON.parse(readFileSync(join(REPO, ".agents", "plugins", "marketplace.json"), "utf8"));
  const claudeMarketplace = JSON.parse(readFileSync(join(REPO, ".claude-plugin", "marketplace.json"), "utf8"));
  assert.equal(codexMarketplace.plugins.some((entry) => entry.name === "project-capability-governance"), true);
  assert.equal(claudeMarketplace.plugins.some((entry) => entry.name === "project-capability-governance"), true);
});
