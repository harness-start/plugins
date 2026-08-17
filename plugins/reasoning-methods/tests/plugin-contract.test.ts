import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(ROOT));

function text(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function json(path) {
  return JSON.parse(text(path));
}

test("plugin publishes two focused skills without the legacy workflow machinery", () => {
  const codex = json(".codex-plugin/plugin.json");
  const claude = json(".claude-plugin/plugin.json");
  assert.equal(codex.name, "reasoning-methods");
  assert.equal(claude.name, codex.name);
  assert.equal(codex.version, "1.0.0");
  assert.equal(claude.version, codex.version);

  const skillNames = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(skillNames, ["first-principles", "reasoning-methods"]);

  for (const skillName of skillNames) {
    const skill = text(`skills/${skillName}/SKILL.md`);
    assert.match(skill, /## The one rule/u);
    assert.match(skill, /## Method/u);
    assert.match(skill, /## Standards/u);
    assert.match(skill, /## Output/u);
    assert.match(skill, /## Honest limits/u);
    assert.doesNotMatch(skill, /\.reasoning-methods|\.first-principles|ledger|workflow\.md|completionReceipt/iu);
  }

  for (const path of ["scripts", ".reasoning-methods", ".first-principles"]) {
    assert.equal(existsSync(join(ROOT, path)), false, path);
  }

  assert.equal(codex.hooks, "./hooks/codex.json");
  assert.equal(claude.hooks, "./hooks/claude.json");
  assert.equal(existsSync(join(ROOT, "hooks", "claude.json")), true);
  assert.equal(existsSync(join(ROOT, "hooks", "codex.json")), true);
  assert.equal(existsSync(join(ROOT, "src", "entries", "hooks", "reasoning-methods.ts")), true);
});

test("skills select an adaptive reasoning structure and a direct evidence-bound output", () => {
  const firstPrinciples = text("skills/first-principles/SKILL.md");
  assert.match(firstPrinciples, /step back/iu);
  assert.match(firstPrinciples, /fact.*assumption|assumption.*fact/iu);
  assert.match(firstPrinciples, /counterexample|falsif/iu);

  const discipline = text("skills/reasoning-methods/SKILL.md");
  for (const branch of ["exact", "causal", "decision", "factual"]) {
    assert.match(discipline, new RegExp(`\\b${branch}\\b`, "iu"));
  }
  assert.match(discipline, /light.*standard.*intensive/isu);
  assert.match(discipline, /verdict first/iu);
  assert.match(discipline, /what would change/iu);
  assert.doesNotMatch(discipline, /always.{0,40}(?:five|5).{0,40}(?:stage|step)/isu);
});

test("both marketplaces replace the two legacy plugin ids with the merged plugin", () => {
  for (const legacyName of ["first-principles-gate", "reasoning-methods-guard"]) {
    assert.equal(existsSync(join(REPO, "plugins", legacyName)), false, legacyName);
  }

  const paths = [
    join(REPO, ".agents", "plugins", "marketplace.json"),
    join(REPO, ".claude-plugin", "marketplace.json"),
  ];

  for (const path of paths) {
    const marketplace = JSON.parse(readFileSync(path, "utf8"));
    const names = marketplace.plugins.map((entry) => entry.name);
    assert.equal(names.includes("reasoning-methods"), true, path);
    assert.equal(names.includes("reasoning-methods-guard"), false, path);
    assert.equal(names.includes("first-principles-gate"), false, path);
    assert.equal(names.filter((name) => name === "reasoning-methods").length, 1, path);
    assert.equal(new Set(names).size, names.length, `${path}: duplicate plugin id`);
  }
});
