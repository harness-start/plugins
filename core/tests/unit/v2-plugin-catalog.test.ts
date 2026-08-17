import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const expected = [
  "agent-activity-audit",
  "android-engineering",
  "brand-logo-production",
  "ci-gated-delivery",
  "command-safety",
  "engineering-practice",
  "engineering-quality",
  "evidence-based-research",
  "execution-discipline",
  "git-delivery",
  "go-engineering",
  "intent-discovery",
  "interface-craft",
  "ios-engineering",
  "java-engineering",
  "kubernetes-operations",
  "language-output",
  "music-production",
  "nix-engineering",
  "poster-production",
  "presentation-production",
  "print-publication-production",
  "professional-writing",
  "project-capability-governance",
  "php-engineering",
  "python-engineering",
  "react-native-engineering",
  "reasoning-methods",
  "repository-history-migration",
  "rust-engineering",
  "software-debugging",
  "source-integrity",
  "spec-driven-development",
  "test-driven-development",
  "training-program-design",
  "video-production",
  "web-frontend-engineering",
  "work-reporting",
].toSorted();

const domainPlugins = [
  "android-engineering",
  "go-engineering",
  "ios-engineering",
  "java-engineering",
  "kubernetes-operations",
  "nix-engineering",
  "php-engineering",
  "python-engineering",
  "react-native-engineering",
  "rust-engineering",
  "web-frontend-engineering",
].toSorted();

function filesBelow(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function hookCommands(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(hookCommands);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [
    ...(typeof record.command === "string" ? [record.command] : []),
    ...Object.values(record).flatMap(hookCommands),
  ];
}

test("v2 publishes exactly the responsibility-oriented catalog", () => {
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

test("published plugins are self-contained: no skill-deps, no vendor-skills, dual-platform Hooks", () => {
  assert.equal(existsSync(resolve(root, "vendor-skills")), false, "vendor-skills/ must be removed");
  for (const plugin of expected) {
    const pluginRoot = resolve(root, "plugins", plugin);
    const manifest = JSON.parse(readFileSync(resolve(pluginRoot, ".claude-plugin/plugin.json"), "utf8"));
    assert.equal(manifest.name, plugin);
    assert.equal("dependencies" in manifest, false, `${plugin} must not declare plugin dependencies`);
    assert.equal(existsSync(resolve(pluginRoot, "skill-deps.json")), false, `${plugin} must not declare skill-deps.json`);
    assert.equal(existsSync(resolve(pluginRoot, "hooks", "claude.json")), true, `${plugin} must ship hooks/claude.json`);
    assert.equal(existsSync(resolve(pluginRoot, "hooks", "codex.json")), true, `${plugin} must ship hooks/codex.json`);
  }
});

test("plugin runtime, Hooks, and internal Skills never address a sibling plugin", () => {
  for (const owner of expected) {
    const pluginRoot = resolve(root, "plugins", owner);
    for (const area of ["src", "hooks", "skills"]) {
      for (const path of filesBelow(resolve(pluginRoot, area))) {
        const text = readFileSync(path, "utf8");
        for (const match of text.matchAll(/plugins\/([a-z0-9-]+)/gu)) {
          const referenced = match[1];
          if (!referenced) continue;
          if (expected.includes(referenced)) {
            assert.equal(referenced, owner, `${owner} addresses sibling plugin ${referenced} in ${path}`);
          }
        }
      }
    }

    const codexHookPath = resolve(pluginRoot, "hooks/codex.json");
    const codexHooks = JSON.parse(readFileSync(codexHookPath, "utf8"));
    for (const command of hookCommands(codexHooks)) {
      assert.match(command, /AI_EXPERTS_SESSION_ID=/u, `${owner} Codex hook must carry session provenance`);
      assert.match(command, /AI_EXPERTS_TRIGGER_FROM=/u, `${owner} Codex hook must carry trigger provenance`);
    }
  }
});

test("required method Skills fail closed in plugin-local orchestration while Hooks remain local", () => {
  const orchestrators = [
    "ci-gated-delivery",
    "engineering-practice",
    "intent-discovery",
    "professional-writing",
    "software-debugging",
    "spec-driven-development",
    "test-driven-development",
  ];
  for (const plugin of orchestrators) {
    const pluginRoot = resolve(root, "plugins", plugin);
    const orchestration = ["src", "skills"]
      .flatMap((area) => filesBelow(resolve(pluginRoot, area)))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    assert.match(orchestration, /ci-gated-mr-workflow|debug-workflow|intent-discovery|sdd|test-driven-development|engineering-|writing-/u, `${plugin} must keep first-party orchestration`);
    assert.doesNotMatch(orchestration, /\$HOME\/\.agents\/skills/u, `${plugin} must not load global community Skills`);
    assert.doesNotMatch(orchestration, /skill-deps\.json|vendor-skills/u, `${plugin} must not name the removed community supply chain`);
  }
});

test("every engineering domain plugin exposes a same-named orchestrator and both platform Hooks", () => {
  for (const plugin of domainPlugins) {
    const rootPath = resolve(root, "plugins", plugin);
    assert.ok(existsSync(resolve(rootPath, "skills", plugin, "SKILL.md")), `${plugin} orchestrator`);
    assert.ok(existsSync(resolve(rootPath, "hooks", "claude.json")), `${plugin} Claude Hooks`);
    assert.ok(existsSync(resolve(rootPath, "hooks", "codex.json")), `${plugin} Codex Hooks`);
    assert.ok(existsSync(resolve(rootPath, "tests", "domain-hook.test.ts")), `${plugin} hook contract test`);
    assert.ok(existsSync(resolve(rootPath, "acceptance", "cases", "01-domain-guard", "case.toml")), `${plugin} live case`);
  }
});

test("domain orchestrators stay first-party and do not load community Skills", () => {
  for (const plugin of domainPlugins) {
    const rootPath = resolve(root, "plugins", plugin);
    const skillText = readFileSync(resolve(rootPath, "skills", plugin, "SKILL.md"), "utf8");
    assert.doesNotMatch(skillText, /skill-deps\.json|npx skills add|\$HOME\/\.agents\/skills/u, `${plugin} must not install community Skills`);
  }
});

test("retired cross-domain guard is absent and engineering-quality no longer owns language checks", () => {
  assert.equal(existsSync(resolve(root, "plugins", "dependency-file-custody")), false);
  const qualitySources = filesBelow(resolve(root, "plugins", "engineering-quality", "src"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assert.doesNotMatch(qualitySources, /javascriptSyntax|typescriptSyntax|pythonSyntax|phpSyntax|composerValidate|phpstan/u);
});

test("merged plugins retain outcome-level acceptance for every merged responsibility", () => {
  const cases = [
    "plugins/agent-activity-audit/acceptance/cases/01-record-shell-command",
    "plugins/agent-activity-audit/acceptance/cases/04-record-file-write",
    "plugins/source-integrity/acceptance/cases/01-deny-backup-artifact",
    "plugins/source-integrity/acceptance/cases/02-repair-utf8-bom",
    "plugins/web-frontend-engineering/acceptance/cases/01-domain-guard",
    "plugins/engineering-quality/acceptance/cases/02-block-oversized-php",
    "plugins/engineering-quality/acceptance/cases/03-fix-heading-jump",
  ];
  for (const relative of cases) {
    assert.ok(existsSync(resolve(root, relative, "case.toml")), `${relative} must declare a case`);
    assert.ok(existsSync(resolve(root, relative, "expect.sh")), `${relative} must check the world-state outcome`);
  }
});

test("Claude poster stop events use the correct modes", () => {
  const hooks = JSON.parse(readFileSync(resolve(root, "plugins/poster-production/hooks/claude.json"), "utf8")).hooks;
  assert.match(hooks.Stop[0].hooks[0].command, /\sstop$/u);
  assert.match(hooks.SubagentStop[0].hooks[0].command, /\ssubagent-stop$/u);
});
