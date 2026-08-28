import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const owners = [
  "activity-audit",
  "artifact-production",
  "delivery-governance",
  "engineering-workflow",
  "interface-design",
  "knowledge-work",
  "session-governance",
  "workspace-integrity",
];
const requiredSections = [
  "Purpose",
  "Design",
  "Capabilities",
  "When to use it",
  "When not to use it",
  "Runtime behavior",
  "Public interfaces",
  "Configuration and state",
  "Boundaries",
  "Verification",
];

test("every AIO owner README explains its consumer contract", () => {
  for (const owner of owners) {
    const ownerRoot = resolve(root, "plugins", owner);
    const readme = readFileSync(resolve(ownerRoot, "README.md"), "utf8");
    assert.ok(readme.length >= 1_500, `${owner} README is too shallow`);
    for (const section of requiredSections) {
      assert.match(readme, new RegExp(`^## ${section}$`, "mu"), `${owner} is missing ${section}`);
    }
    for (const module of readdirSync(resolve(ownerRoot, "modules"), { withFileTypes: true })) {
      if (!module.isDirectory()) continue;
      assert.match(readme, new RegExp("`" + module.name + "`", "u"), `${owner} omits private module ${module.name}`);
    }
    assert.match(readme, /Claude Code/u, `${owner} omits Claude Code`);
    assert.match(readme, /Codex/u, `${owner} omits Codex`);
    assert.match(readme, /\bHook(?:s)?\b/u, `${owner} omits Hooks`);
    assert.match(readme, /\bSkill(?:s)?\b/u, `${owner} omits Skills`);
    assert.match(readme, /modules\//u, `${owner} omits its private-module design`);
    assert.match(readme, /no capability profiles/iu, `${owner} omits the all-in installation contract`);
    assert.doesNotMatch(readme, /\/srv\/workspaces|\.tmp-harness-aio/u, `${owner} leaks a development-machine path`);
  }
});

test("owners document every public deterministic interface they expose", () => {
  for (const owner of owners) {
    const ownerRoot = resolve(root, "plugins", owner);
    const readme = readFileSync(resolve(ownerRoot, "README.md"), "utf8");
    if (existsSync(resolve(ownerRoot, "routes/cli.json"))) {
      assert.match(readme, /dist\/cli\/harness\.mjs/u, `${owner} omits the harness CLI`);
      const routes = JSON.parse(readFileSync(resolve(ownerRoot, "routes/cli.json"), "utf8")) as Record<string, unknown>;
      for (const resource of Object.keys(routes)) {
        assert.match(readme, new RegExp("`" + resource + "`", "u"), `${owner} omits CLI resource ${resource}`);
      }
    }
  }
  const knowledgeReadme = readFileSync(resolve(root, "plugins/knowledge-work/README.md"), "utf8");
  assert.match(knowledgeReadme, /research_provenance/u, "knowledge-work omits its public MCP server");
});
