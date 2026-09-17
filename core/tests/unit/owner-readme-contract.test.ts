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
  "用途",
  "设计",
  "能力",
  "适用场景",
  "不适用场景",
  "运行时行为",
  "公开接口",
  "配置与状态",
  "边界",
  "验证",
];

test("every AIO owner README explains its consumer contract", () => {
  for (const owner of owners) {
    const ownerRoot = resolve(root, "plugins", owner);
    const readme = readFileSync(resolve(ownerRoot, "README.md"), "utf8");
    assert.ok(readme.length >= 1_500, `${owner} README is too shallow`);
    for (const section of requiredSections) {
      assert.match(readme, new RegExp(`^## ${section}$`, "mu"), `${owner} is missing ${section}`);
    }
    assert.equal(existsSync(resolve(ownerRoot, "modules")), false, `${owner} retains private modules`);
    assert.doesNotMatch(readme, /modules\//u, `${owner} documents the retired private-module design`);
    const domainsRoot = resolve(ownerRoot, "src", "domains");
    if (existsSync(domainsRoot)) {
      for (const domain of readdirSync(domainsRoot, { withFileTypes: true })) {
        if (!domain.isDirectory()) continue;
        assert.match(readme, new RegExp("`" + domain.name + "`", "u"), `${owner} omits fused domain ${domain.name}`);
      }
    }
    assert.match(readme, /Claude Code/u, `${owner} omits Claude Code`);
    assert.match(readme, /Codex/u, `${owner} omits Codex`);
    assert.match(readme, /\bHook(?:s)?\b/u, `${owner} omits Hooks`);
    assert.match(readme, /\bSkill(?:s)?\b/u, `${owner} omits Skills`);
    assert.match(readme, /没有能力 profile/u, `${owner} omits the all-in installation contract`);
    assert.doesNotMatch(readme, /\/srv\/workspaces|\.tmp-harness-aio/u, `${owner} leaks a development-machine path`);
    if (owner === "workspace-integrity") {
      const skillsRoot = resolve(ownerRoot, "skills");
      for (const skill of readdirSync(skillsRoot, { withFileTypes: true })) {
        if (!skill.isDirectory()) continue;
        assert.match(
          readme,
          new RegExp("`" + skill.name + "`", "u"),
          `${owner} omits public Skill ${skill.name}`,
        );
      }
    }
    if (owner === "artifact-production") {
      assert.match(readme, /SubagentStart/u, `${owner} omits SubagentStart`);
      assert.match(
        readme,
        /logo:brand-logo-production/u,
        `${owner} omits the SubagentStart logo handler`,
      );
      assert.match(readme, /subagent/u, `${owner} omits the SubagentStart subagent argument`);
    }
  }
});

test("root README lists only Hook events that owners actually register", () => {
  const readme = readFileSync(resolve(root, "README.md"), "utf8");
  assert.doesNotMatch(readme, /PreCompact|PostCompact/u, "root README claims unregistered compact Hook events");
  const registered = new Set<string>();
  for (const owner of owners) {
    for (const host of ["claude", "codex"] as const) {
      const manifest = JSON.parse(
        readFileSync(resolve(root, "plugins", owner, "hooks", `${host}.json`), "utf8"),
      ) as { hooks?: Record<string, unknown> };
      for (const event of Object.keys(manifest.hooks ?? {})) registered.add(event);
    }
  }
  assert.equal(registered.has("PreCompact"), false);
  assert.equal(registered.has("PostCompact"), false);
  for (const event of registered) {
    assert.match(readme, new RegExp("`" + event + "`", "u"), `root README omits registered Hook ${event}`);
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
