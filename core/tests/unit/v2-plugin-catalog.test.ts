import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const expected = [
  "agent-activity-audit",
  "brand-logo-production",
  "ci-gated-delivery",
  "command-safety",
  "dependency-file-custody",
  "engineering-practice",
  "engineering-quality",
  "evidence-based-research",
  "execution-discipline",
  "git-delivery",
  "intent-discovery",
  "language-output",
  "music-production",
  "poster-production",
  "presentation-production",
  "print-publication-production",
  "professional-writing",
  "project-capability-governance",
  "reasoning-methods",
  "repository-history-migration",
  "software-debugging",
  "source-integrity",
  "spec-driven-development",
  "test-driven-development",
  "video-production",
  "work-reporting",
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

test("every declared community Skill is pinned and no plugin declares another plugin", () => {
  for (const plugin of expected) {
    const pluginRoot = resolve(root, "plugins", plugin);
    const manifest = JSON.parse(readFileSync(resolve(pluginRoot, ".claude-plugin/plugin.json"), "utf8"));
    assert.equal(manifest.name, plugin);
    assert.equal("dependencies" in manifest, false, `${plugin} must not declare plugin dependencies`);

    try {
      const deps = JSON.parse(readFileSync(resolve(pluginRoot, "skill-deps.json"), "utf8"));
      for (const skill of deps.skills) {
        assert.match(skill.revision, /^[0-9a-f]{40}$/u, `${plugin}:${skill.name} must use an exact commit`);
        assert.match(skill.source, /^https:\/\//u, `${plugin}:${skill.name} must be an external Skill source`);
        if (skill.mode === "audited-executable") {
          assert.equal(skill.execution?.approved, true, `${plugin}:${skill.name} executable must be approved`);
          assert.ok(skill.execution.paths.length > 0, `${plugin}:${skill.name} executable needs approved paths`);
          for (const executable of skill.execution.paths) {
            assert.match(executable.sha256, /^[0-9a-f]{64}$/u, `${plugin}:${skill.name}:${executable.path} needs SHA-256`);
          }
        } else {
          assert.equal("execution" in skill, false, `${plugin}:${skill.name} cannot declare executable paths in ${skill.mode ?? "default"} mode`);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
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
    if (existsSync(codexHookPath)) {
      const codexHooks = JSON.parse(readFileSync(codexHookPath, "utf8"));
      for (const command of hookCommands(codexHooks)) {
        assert.match(command, /AI_EXPERTS_SESSION_ID=/u, `${owner} Codex hook must carry session provenance`);
        assert.match(command, /AI_EXPERTS_TRIGGER_FROM=/u, `${owner} Codex hook must carry trigger provenance`);
      }
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
    const deps = JSON.parse(readFileSync(resolve(pluginRoot, "skill-deps.json"), "utf8"));
    const orchestration = ["src", "skills"]
      .flatMap((area) => filesBelow(resolve(pluginRoot, area)))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    for (const skill of deps.skills.filter((item: { required?: boolean }) => item.required === true)) {
      assert.match(orchestration, new RegExp(`\\b${skill.name}\\b`, "u"), `${plugin} must route ${skill.name}`);
    }
    assert.match(orchestration, /absent|unreadable|missing|缺失|不可读/u, `${plugin} must detect a missing required Skill`);
    assert.match(orchestration, /stop|停止/u, `${plugin} must stop the affected orchestration route`);
  }
});

test("merged plugins retain outcome-level acceptance for every merged responsibility", () => {
  const cases = [
    "plugins/agent-activity-audit/acceptance/cases/01-record-shell-command",
    "plugins/agent-activity-audit/acceptance/cases/04-record-file-write",
    "plugins/source-integrity/acceptance/cases/01-deny-backup-artifact",
    "plugins/source-integrity/acceptance/cases/02-repair-utf8-bom",
    "plugins/engineering-quality/acceptance/cases/01-repair-javascript-syntax",
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
