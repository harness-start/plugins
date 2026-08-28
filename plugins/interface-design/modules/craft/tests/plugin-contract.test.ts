import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { assertModuleRoutedOnBothHosts } from "../../../../../core/tests/support/aio-routes.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(dirname(dirname(ROOT))));

test("typography floor is script-aware and responsive instead of using one universal measure", () => {
  const skill = readFileSync(join(ROOT, "skills/interface-craft-floor/SKILL.md"), "utf8");
  assert.match(skill, /CJK/u);
  assert.match(skill, /mixed[- ]script/iu);
  assert.match(skill, /responsive/iu);
  assert.doesNotMatch(skill, /body measure 65–75ch/iu);
});

test("orchestrator covers direction, design-system continuity, motion, and rendered review without new top-level Skills", () => {
  const orchestrator = text("skills/interface-craft/SKILL.md");
  for (const reference of [
    "visual-direction.md",
    "design-system.md",
    "design-memory.md",
    "design-memory-template.md",
    "reference-analysis.md",
    "motion.md",
    "motion-tokens.md",
    "motion-recipes.md",
  ]) {
    assert.equal(existsSync(join(ROOT, "skills", "interface-craft", "references", reference)), true, reference);
    assert.match(orchestrator, new RegExp(reference.replace(".", "\\."), "u"));
  }
  assert.match(orchestrator, /existing.*(?:token|component|brand)/isu);
  assert.match(orchestrator, /render|screenshot/iu);
  assert.match(text("skills/interface-visual-critique/SKILL.md"), /render|screenshot/iu);
  assert.match(text("skills/interface-craft-floor/SKILL.md"), /reduced-motion/iu);
});

test("design memory has one managed DESIGN.md block with evidence and verification status", () => {
  const memory = text("skills/interface-craft/references/design-memory.md");
  const template = text("skills/interface-craft/references/design-memory-template.md");
  for (const body of [memory, template]) {
    assert.match(body, /<!-- interface-craft:system:start -->/u);
    assert.match(body, /<!-- interface-craft:system:end -->/u);
    assert.match(body, /Evidence/u);
    assert.match(body, /facts|事实/iu);
    assert.match(body, /inferences|推断/iu);
    assert.match(body, /assumptions|假设/iu);
    assert.match(body, /verification status/iu);
  }
  assert.match(memory, /outside.*managed block|托管块外/iu);
  assert.match(memory, /material redesign|实质性改版/iu);
  assert.match(memory, /local fix|局部修复/iu);
});

test("visual critique requires severity, exact anchors, evidence, recovery, and a bounded verdict", () => {
  const critique = text("skills/interface-visual-critique/SKILL.md");
  for (const term of ["blocker", "major", "minor", "file:line", "approved", "changes_required", "unverified"]) {
    assert.match(critique, new RegExp(term, "iu"), term);
  }
  assert.match(critique, /evidence|证据/iu);
  assert.match(critique, /recovery|恢复/iu);
  assert.match(critique, /responsible|负责/iu);
  assert.match(critique, /ratified|批准|既定/iu);
  assert.match(critique, /Hook fact is not automatically a design defect/iu);
});

test("motion references cover semantic tokens, usage matching, interruption, exits, and nine recipes", () => {
  const tokens = text("skills/interface-craft/references/motion-tokens.md");
  const method = text("skills/interface-craft/references/motion.md");
  const recipes = text("skills/interface-craft/references/motion-recipes.md");
  assert.match(tokens, /match.*usage|按用途/iu);
  assert.match(tokens, /existing.*token|现有.*token/iu);
  for (const term of ["interrupt", "exit", "reduced-motion"]) {
    assert.match(`${tokens}\n${method}\n${recipes}`, new RegExp(term, "iu"), term);
  }
  assert.match(`${method}\n${recipes}`, /setTimeout/iu);
  assert.match(`${method}\n${recipes}`, /transitionend/iu);
  for (const recipe of [
    "button press",
    "popover",
    "dialog",
    "accordion",
    "tabs",
    "toast",
    "text/value swap",
    "skeleton/reveal",
    "validation feedback",
  ]) {
    assert.match(recipes, new RegExp(recipe.replace("/", "\\/"), "iu"), recipe);
  }
});

function text(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

test("private craft module is self-contained and routed on both hosts", () => {
  assertModuleRoutedOnBothHosts(import.meta.url, "craft");
  assert.equal(existsSync(join(ROOT, "skill-deps.json")), false);
  assert.equal(existsSync(join(ROOT, "licenses", "impeccable", "NOTICE.md")), true);
  assert.match(text("licenses/impeccable/NOTICE.md"), /Apache-2\.0/u);
  assert.deepEqual(
    readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(),
    ["interface-craft", "interface-craft-floor", "interface-visual-critique"],
  );
  for (const area of ["src", "skills"]) {
    for (const file of readdirSync(join(ROOT, area), { recursive: true, withFileTypes: true })) {
      if (!file.isFile()) continue;
      const body = readFileSync(join(file.parentPath, file.name), "utf8");
      assert.doesNotMatch(body, /plugins\/(?:poster-production|presentation-production|video-production)/u);
    }
  }
});

test("both marketplaces publish the plugin once", () => {
  for (const path of [
    join(REPO, ".agents", "plugins", "marketplace.json"),
    join(REPO, ".claude-plugin", "marketplace.json"),
  ]) {
    const marketplace = JSON.parse(readFileSync(path, "utf8"));
    const entries = marketplace.plugins.filter((entry: { name: string }) => entry.name === "interface-design");
    assert.equal(entries.length, 1, path);
  }
});

test("acceptance includes a rendered responsive interface outcome", () => {
  const caseRoot = join(ROOT, "acceptance", "cases", "02-responsive-system");
  assert.equal(existsSync(join(caseRoot, "case.toml")), true);
  assert.equal(existsSync(join(caseRoot, "prompt.md")), true);
  assert.equal(existsSync(join(caseRoot, "expect.sh")), true);
  assert.equal(existsSync(join(ROOT, "acceptance", "check-layout.mjs")), true);
});

test("acceptance covers design memory, continuity, motion, and review-only outcomes", () => {
  for (const id of ["03-design-memory", "04-design-continuity", "05-motion-contract", "06-review-only"]) {
    const caseRoot = join(ROOT, "acceptance", "cases", id);
    for (const file of ["case.toml", "prompt.md", "expect.sh"]) {
      assert.equal(existsSync(join(caseRoot, file)), true, `${id}/${file}`);
    }
  }
});
