import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
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

function pluginSkillNames(pluginRoot: string): Set<string> {
  const names = new Set<string>();
  for (const path of filesBelow(resolve(pluginRoot, "skills"))) {
    if (!path.endsWith("/SKILL.md")) continue;
    const match = readFileSync(path, "utf8").match(/^name:\s*["']?([^"'\r\n]+)["']?\s*$/mu);
    if (match?.[1]) names.add(match[1]);
  }
  return names;
}

function unresolvedPluginSkillReferences(pluginRoot: string): string[] {
  const localNames = pluginSkillNames(pluginRoot);
  const findings = new Set<string>();
  const action = /\b(?:use|load|read|invoke|call|follow|route|recommend|consult|delegate|search)\b|使用|加载|调用|路由|推荐|遵循|委派|搜索|可选调用/iu;
  const relationship = /\b(?:other|sibling|community|official|suggested) skills?\b/iu;
  const skillWord = /(?<![-\w])skills?\b/iu;
  const negativeInstruction = /\b(?:do not|never)\b|禁止|不得/iu;
  const files = [
    ...filesBelow(resolve(pluginRoot, "skills")),
    ...filesBelow(resolve(pluginRoot, "src")),
    ...filesBelow(resolve(pluginRoot, "hooks")),
    resolve(pluginRoot, "README.md"),
  ].filter((path) => existsSync(path) && /\.(?:c?js|mjs|ts|json|md|ya?ml)$/u.test(path));

  const report = (path: string, lineNumber: number, reference: string) => {
    if (reference !== reference.toLowerCase()) return;
    if (!localNames.has(reference)) {
      findings.add(`${path.slice(pluginRoot.length + 1)}:${lineNumber} -> ${reference}`);
    }
  };

  for (const path of files) {
    const lines = readFileSync(path, "utf8").split(/\r?\n/u);
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      for (const match of line.matchAll(/(?:\.agents|\.claude)\/skills\/([a-z][a-z0-9-]*)/gu)) {
        if (match[1]) report(path, lineNumber, match[1]);
      }
      for (const match of line.matchAll(/skills\/([a-z][a-z0-9-]*)\/SKILL\.md/gu)) {
        if (match[1]) report(path, lineNumber, match[1]);
      }
      const positiveSkillContext = !negativeInstruction.test(line)
        && ((skillWord.test(line) && action.test(line)) || relationship.test(line));
      if (positiveSkillContext) {
        for (const match of line.matchAll(/\$([a-z][a-z0-9-]{2,})/gu)) {
          if (match[1]) report(path, lineNumber, match[1]);
        }
        for (const match of line.matchAll(/\b([a-z][a-z0-9-]*:[a-z][a-z0-9-]*)\b/gu)) {
          if (match[1]) report(path, lineNumber, match[1]);
        }
        for (const match of line.matchAll(/`([a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?)`\s+(?:Skills?|技能)/gu)) {
          if (match[1]) report(path, lineNumber, match[1]);
        }
        for (const match of line.matchAll(/(?:Skills?|技能)\s*(?:(?:named|called)\s+|[:：]\s*)?`([a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?)`/gu)) {
          if (match[1]) report(path, lineNumber, match[1]);
        }
        for (const match of line.matchAll(/\b(?:invoke|call|use)\s+(?:with\s+)?\/([a-z][a-z0-9-]*)/giu)) {
          if (match[1]) report(path, lineNumber, match[1]);
        }
      }
      if (!negativeInstruction.test(line)) {
        for (const match of line.matchAll(/(?:\b(?:load|invoke|call|route|recommend|consult|search)\b|加载|调用|路由|推荐|搜索|可选调用)[^$\n]{0,80}`?\$([a-z][a-z0-9-]{2,})/giu)) {
          if (match[1]) report(path, lineNumber, match[1]);
        }
      }
      if (/https?:\/\/\S+\/(?:skills|plugins)\/\S*SKILL\.md/iu.test(line)) {
        findings.add(`${path.slice(pluginRoot.length + 1)}:${lineNumber} -> remote SKILL.md`);
      }
      if (/\b(?:android\s+skills\s+add|npx\s+(?:--yes\s+)?skills\s+add)\b/iu.test(line)) {
        findings.add(`${path.slice(pluginRoot.length + 1)}:${lineNumber} -> external Skill installer`);
      }
      if (/\bpublic Skills CLI\b|\bcommunity `[^`]+` skill\b|\bsuggested skills\b/iu.test(line)) {
        findings.add(`${path.slice(pluginRoot.length + 1)}:${lineNumber} -> unresolved Skill discovery`);
      }
      if (/\bskills?\b[^\n]{0,240}\b(?:may|can) be (?:used|loaded|invoked|consulted|called|recommended)\b[^\n]{0,160}\b(?:runtime|session|environment)\b/iu.test(line)) {
        findings.add(`${path.slice(pluginRoot.length + 1)}:${lineNumber} -> runtime-provided Skill exception`);
      }
    });
  }
  return [...findings].toSorted();
}

const COMPANION_EXT = /\.(?:md|mdx|ya?ml|json|mjs|cjs|js|ts|py|sh|svg|png|txt)$/iu;
const CONSUMER_PREFIX = /^(?:\.agents|\.claude|\.codex|\.research|\.ai-experts|\.antigravity|\.cursor|\.gemini|\.vscode|tmp|src|handoffs|evidence|dist|slides|output|outputs)\//u;

function stripHref(href: string): string {
  return href.replace(/[?#].*$/u, "").trim();
}

function skipCompanionHref(href: string): boolean {
  if (!href) return true;
  if (/^(?:https?:|mailto:|#|\$\{)/iu.test(href)) return true;
  if (/[<>{}~]/.test(href)) return true;
  if (href.startsWith("/") || href.startsWith("~/")) return true;
  if (CONSUMER_PREFIX.test(href)) return true;
  return false;
}

function looksLikeCompanionTarget(href: string): boolean {
  if (href.endsWith("/")) return /(?:^|\/)(?:references|scripts|assets|templates|evals)(?:\/|$)/u.test(href);
  if (COMPANION_EXT.test(href)) return true;
  return /(?:^|\/)(?:references|scripts|assets|templates|evals)$/u.test(href);
}

export function extractSkillLocalCompanions(text: string): Array<{ href: string; line: number }> {
  const found: Array<{ href: string; line: number }> = [];
  const add = (raw: string, line: number) => {
    const href = stripHref(raw);
    if (skipCompanionHref(href) || !looksLikeCompanionTarget(href)) return;
    found.push({ href, line });
  };

  let supportingTechniques = false;
  text.split(/\r?\n/u).forEach((line, index) => {
    const lineNumber = index + 1;
    if (/^#{1,3}\s/u.test(line)) {
      supportingTechniques = /supporting techniques|available in this directory/iu.test(line);
    }
    if (/available in this directory/iu.test(line)) supportingTechniques = true;

    for (const match of line.matchAll(/\[(?:[^\]]*)\]\(([^)]+)\)/gu)) {
      if (match[1]) add(match[1], lineNumber);
    }
    for (const match of line.matchAll(/^\s*\[[^\]]+\]:\s+(\S+)/gu)) {
      if (match[1]) add(match[1], lineNumber);
    }
    for (const match of line.matchAll(/`((?:references|scripts|assets|templates)\/[^`\s]+)`/gu)) {
      if (match[1]) add(match[1], lineNumber);
    }
    if (/in this directory/iu.test(line) || supportingTechniques) {
      for (const match of line.matchAll(/`([^`\s]+\.md)`/gu)) {
        if (match[1]) add(match[1], lineNumber);
      }
    }
  });
  return found;
}

function companionExists(target: string, href: string): boolean {
  if (!existsSync(target)) return false;
  const stat = statSync(target);
  if (href.endsWith("/") || extname(target) === "") {
    if (!stat.isDirectory()) return false;
    return filesBelow(target).length > 0;
  }
  return stat.isFile() && stat.size > 0;
}

function skillRootFor(path: string, pluginRoot: string): string {
  let current = dirname(path);
  while (current.startsWith(pluginRoot)) {
    if (existsSync(resolve(current, "SKILL.md"))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirname(path);
}

function unresolvedSkillLocalCompanions(pluginRoot: string): string[] {
  const findings = new Set<string>();
  for (const path of filesBelow(resolve(pluginRoot, "skills"))) {
    if (!/\.(?:md|ya?ml)$/u.test(path)) continue;
    const text = readFileSync(path, "utf8");
    const skillRoot = skillRootFor(path, pluginRoot);
    for (const { href, line } of extractSkillLocalCompanions(text)) {
      const candidates = [resolve(dirname(path), href), resolve(skillRoot, href)];
      const hit = candidates.find((target) => {
        const rel = relative(pluginRoot, target);
        return rel !== "" && !rel.startsWith("..") && companionExists(target, href);
      });
      if (!hit) findings.add(`${path.slice(pluginRoot.length + 1)}:${line} -> ${href}`);
    }
  }
  return [...findings].toSorted();
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

test("published plugin instructions resolve only same-plugin Skills", () => {
  const findings = expected.flatMap((plugin) => {
    const pluginRoot = resolve(root, "plugins", plugin);
    return unresolvedPluginSkillReferences(pluginRoot).map((finding) => `${plugin}: ${finding}`);
  });
  assert.deepEqual(findings, []);
});

test("published plugin Skill bodies resolve same-plugin local companions", () => {
  const findings = expected.flatMap((plugin) => {
    const pluginRoot = resolve(root, "plugins", plugin);
    return unresolvedSkillLocalCompanions(pluginRoot).map((finding) => `${plugin}: ${finding}`);
  });
  assert.deepEqual(findings, []);
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
