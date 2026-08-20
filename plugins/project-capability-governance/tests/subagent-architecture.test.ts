import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

const dedicatedPlugins = [
  "subagent-lifecycle-audit",
  "subagent-workflow-guard",
];

const naturalLanguageOwners = [
  "software-debugging",
  "project-capability-governance",
  "work-reporting",
];

function readJson(path) {
  return JSON.parse(readFileSync(join(REPO, path), "utf8"));
}

test("repository ships no central subagent management plugin", () => {
  for (const name of dedicatedPlugins) {
    assert.equal(existsSync(join(REPO, "plugins", name)), false, name);
  }

  for (const path of [
    ".claude-plugin/marketplace.json",
    ".agents/plugins/marketplace.json",
  ]) {
    const names = readJson(path).plugins.map((plugin) => plugin.name);
    for (const name of dedicatedPlugins) assert.equal(names.includes(name), false, `${path}: ${name}`);
  }
});

test("domain plugins do not authenticate or schedule native subagents", () => {
  for (const name of naturalLanguageOwners) {
    assert.equal(existsSync(join(REPO, "plugins", name, "agents")), false, `${name}/agents`);
    for (const host of ["claude", "codex"]) {
      const hooks = readJson(`plugins/${name}/hooks/${host}.json`).hooks;
      assert.equal(Object.hasOwn(hooks, "SubagentStart"), false, `${name}/${host}: SubagentStart`);
      assert.equal(Object.hasOwn(hooks, "SubagentStop"), false, `${name}/${host}: SubagentStop`);
    }
  }
});

test("domain skill prompts use plain delegation without shared handoff protocols", () => {
  const skillPaths = [
    "plugins/software-debugging/skills/debug-workflow/SKILL.md",
    "plugins/project-capability-governance/skills/project-capability-governance/SKILL.md",
    "plugins/reasoning-methods/skills/first-principles/SKILL.md",
    "plugins/reasoning-methods/skills/reasoning-methods/SKILL.md",
    "plugins/evidence-based-research/skills/research-evidence-workflow/SKILL.md",
  ];
  const forbidden = /subagent-(?:handoff|plan-execution)|SUBAGENT_APPLICATION|(?:DBG|FP|RD)_REVIEW_(?:REQUEST|RESULT)|reviewNonce/iu;

  for (const path of skillPaths) {
    assert.doesNotMatch(readFileSync(join(REPO, path), "utf8"), forbidden, path);
  }
});
