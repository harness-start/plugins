import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { assertModuleRoutedOnBothHosts } from "../../../../../core/tests/support/aio-routes.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const REPO = resolve(ROOT, "../..");

function text(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

test("private module keeps two focused skills without the legacy workflow machinery", () => {
  assertModuleRoutedOnBothHosts(import.meta.url, "reasoning");
  const skillNames = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && ["first-principles", "reasoning-methods"].includes(entry.name))
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

  assert.equal(existsSync(join(ROOT, "src", "domains", "reasoning", "entries", "hooks", "reasoning-methods.ts")), true);
});

test("skills select an adaptive reasoning structure and a direct evidence-bound output", () => {
  const firstPrinciples = text("skills/first-principles/SKILL.md");
  assert.match(firstPrinciples, /step back/iu);
  assert.match(firstPrinciples, /fact.*assumption|assumption.*fact/iu);
  assert.match(firstPrinciples, /counterexample|falsif/iu);

  const discipline = text("skills/reasoning-methods/SKILL.md");
  for (const branch of ["exact", "causal", "claim", "decision", "system", "divergence"]) {
    assert.match(discipline, new RegExp(`\\b${branch}\\b`, "iu"));
  }
  assert.match(discipline, /none.*one primary|one primary.*none/isu);
  assert.match(discipline, /base rate/iu);
  assert.match(discipline, /reversib/iu);
  assert.match(discipline, /opportunity cost/iu);
  assert.match(discipline, /update condition|what would change/iu);
  assert.match(discipline, /feedback.*delay|delay.*feedback/isu);
  assert.match(discipline, /model voting|vote.*models/iu);
  assert.match(discipline, /verdict first/iu);
  assert.match(discipline, /what would change/iu);
  assert.doesNotMatch(discipline, /always.{0,40}(?:five|5).{0,40}(?:stage|step)/isu);
});

test("deep-dialogue skills stay explicit, distinct, adaptive, and user-stoppable", () => {
  const grill = text("skills/grill-me/SKILL.md");
  const tutor = text("skills/socratic-tutor/SKILL.md");

  for (const body of [grill, tutor]) {
    assert.match(body, /disable-model-invocation: true/u);
    assert.match(body, /one question (?:at a time|per turn)/iu);
    assert.match(body, /stop|exit/iu);
    assert.match(body, /direct answer|direct recommendation/iu);
  }

  assert.match(grill, /surface.*tension.*closure/isu);
  assert.match(grill, /final brief/iu);
  assert.match(tutor, /learning target/iu);
  assert.match(tutor, /counterexample/iu);
  assert.match(tutor, /novel example|new example/iu);
  assert.doesNotMatch(tutor, /never (?:give|provide).*answer/iu);
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
    assert.equal(names.includes("session-governance"), true, path);
    assert.equal(names.includes("reasoning-methods-guard"), false, path);
    assert.equal(names.includes("first-principles-gate"), false, path);
    assert.equal(names.filter((name) => name === "session-governance").length, 1, path);
    assert.equal(new Set(names).size, names.length, `${path}: duplicate plugin id`);
  }
});
