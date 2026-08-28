import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const expected = [
  "activity-audit",
  "artifact-production",
  "delivery-governance",
  "engineering-workflow",
  "interface-design",
  "knowledge-work",
  "session-governance",
  "workspace-integrity",
].toSorted();

const cliOwners = [
  "artifact-production",
  "delivery-governance",
  "engineering-workflow",
  "knowledge-work",
];

type RuntimeRoute = { module: string; script: string };

function assertRouteTarget(owner: string, route: RuntimeRoute, label: string): void {
  const target = resolve(root, "plugins", owner, "modules", route.module, route.script);
  assert.ok(existsSync(target), `${label} -> ${target}`);
}

function privateHostRegistrations(moduleRoot: string): string[] {
  const forbidden = [
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    ".mcp.json",
    "hooks/claude.json",
    "hooks/codex.json",
    "mcp/codex.json",
  ];
  return forbidden
    .map((path) => resolve(moduleRoot, path))
    .filter((path) => existsSync(path))
    .map((path) => relative(root, path));
}

test("AIO publishes exactly the fixed eight-owner catalog", () => {
  const actual = readdirSync(resolve(root, "plugins"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
  assert.deepEqual(actual, expected);

  for (const catalogPath of [".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json"]) {
    const catalog = JSON.parse(readFileSync(resolve(root, catalogPath), "utf8"));
    assert.deepEqual(catalog.plugins.map((plugin: { name: string }) => plugin.name).toSorted(), expected);
  }
});

test("AIO owners remain independently installable and use the unified CLI protocol", () => {
  for (const plugin of expected) {
    const pluginRoot = resolve(root, "plugins", plugin);
    const claudeManifestPath = resolve(pluginRoot, ".claude-plugin/plugin.json");
    const codexManifestPath = resolve(pluginRoot, ".codex-plugin/plugin.json");
    assert.ok(existsSync(claudeManifestPath), `${plugin} Claude manifest`);
    assert.ok(existsSync(codexManifestPath), `${plugin} Codex manifest`);
    assert.equal(JSON.parse(readFileSync(claudeManifestPath, "utf8")).skills, "./skills/", `${plugin} Claude Skills`);
    assert.equal(JSON.parse(readFileSync(codexManifestPath, "utf8")).skills, "./skills/", `${plugin} Codex Skills`);
    assert.ok(existsSync(resolve(pluginRoot, "hooks/claude.json")), `${plugin} Claude hooks`);
    assert.ok(existsSync(resolve(pluginRoot, "hooks/codex.json")), `${plugin} Codex hooks`);
  }
  const knowledgeRoot = resolve(root, "plugins/knowledge-work");
  const codexKnowledge = JSON.parse(readFileSync(resolve(knowledgeRoot, ".codex-plugin/plugin.json"), "utf8"));
  assert.equal(codexKnowledge.mcpServers, "./mcp/codex.json");
  assert.ok(existsSync(resolve(knowledgeRoot, ".mcp.json")), "knowledge-work Claude MCP manifest");
  assert.ok(existsSync(resolve(knowledgeRoot, "mcp/codex.json")), "knowledge-work Codex MCP manifest");
  for (const plugin of cliOwners) {
    assert.ok(existsSync(resolve(root, "plugins", plugin, "src/entries/cli/harness.ts")), `${plugin} harness CLI source`);
  }
});

test("AIO installer has one fixed catalog and no capability profile surface", () => {
  const installer = readFileSync(resolve(root, "scripts/install-all.sh"), "utf8");
  assert.doesNotMatch(installer, /--profile\b/u);
  assert.match(installer, /install all catalog plugins/iu);
});

test("every owner route resolves to a bundled private module entrypoint", () => {
  for (const owner of expected) {
    const ownerRoot = resolve(root, "plugins", owner);
    for (const host of ["claude", "codex"]) {
      const routes = JSON.parse(readFileSync(resolve(ownerRoot, `routes/${host}.json`), "utf8")) as Record<string, RuntimeRoute[]>;
      for (const [event, entries] of Object.entries(routes)) {
        for (const route of entries) assertRouteTarget(owner, route, `${owner} ${host} ${event}`);
      }
    }
    const cliPath = resolve(ownerRoot, "routes/cli.json");
    if (!existsSync(cliPath)) continue;
    const routes = JSON.parse(readFileSync(cliPath, "utf8")) as Record<string, Record<string, RuntimeRoute>>;
    for (const [resource, actions] of Object.entries(routes)) {
      for (const [action, route] of Object.entries(actions)) {
        assertRouteTarget(owner, route, `${owner} CLI ${resource} ${action}`);
      }
    }
  }
});

test("private modules contain implementations but no host registration surface", () => {
  const findings: string[] = [];
  for (const owner of expected) {
    const modulesRoot = resolve(root, "plugins", owner, "modules");
    for (const module of readdirSync(modulesRoot, { withFileTypes: true })) {
      if (!module.isDirectory()) continue;
      const moduleRoot = resolve(modulesRoot, module.name);
      findings.push(...privateHostRegistrations(moduleRoot));
      assert.match(
        readFileSync(resolve(moduleRoot, "README.md"), "utf8"),
        /Private AIO module/u,
        `${owner}/${module.name} must document its private boundary`,
      );
    }
  }
  assert.deepEqual(findings.toSorted(), []);
});

test("workspace language modules protect mutations without automatic post-tool language workflows", () => {
  const languageModules = new Set([
    "android", "go", "ios", "java", "nix", "php", "python", "react-native", "rust", "web",
  ]);
  for (const host of ["claude", "codex"]) {
    const routes = JSON.parse(readFileSync(resolve(root, `plugins/workspace-integrity/routes/${host}.json`), "utf8")) as Record<string, RuntimeRoute[]>;
    for (const [event, entries] of Object.entries(routes)) {
      if (event === "PreToolUse") continue;
      assert.equal(entries.some((route) => languageModules.has(route.module)), false, `${host} ${event}`);
    }
  }
});
