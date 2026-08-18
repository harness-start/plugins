import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(ROOT));

test("typography floor is script-aware and responsive instead of using one universal measure", () => {
  const skill = readFileSync(join(ROOT, "skills/interface-craft-floor/SKILL.md"), "utf8");
  assert.match(skill, /CJK/u);
  assert.match(skill, /mixed[- ]script/iu);
  assert.match(skill, /responsive/iu);
  assert.doesNotMatch(skill, /body measure 65–75ch/iu);
});

test("orchestrator covers direction, design-system continuity, motion, and rendered review without new top-level Skills", () => {
  const orchestrator = text("skills/interface-craft/SKILL.md");
  for (const reference of ["visual-direction.md", "design-system.md", "motion.md"]) {
    assert.equal(existsSync(join(ROOT, "skills", "interface-craft", "references", reference)), true, reference);
    assert.match(orchestrator, new RegExp(reference.replace(".", "\\."), "u"));
  }
  assert.match(orchestrator, /existing.*(?:token|component|brand)/isu);
  assert.match(orchestrator, /render|screenshot/iu);
  assert.match(text("skills/interface-visual-critique/SKILL.md"), /render|screenshot/iu);
  assert.match(text("skills/interface-craft-floor/SKILL.md"), /reduced-motion/iu);
});

function text(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

function json(path: string) {
  return JSON.parse(text(path));
}

test("plugin is self-contained with dual-platform Hooks and no skill-deps", () => {
  const claude = json(".claude-plugin/plugin.json");
  const codex = json(".codex-plugin/plugin.json");
  assert.equal(claude.name, "interface-craft");
  assert.equal(codex.name, claude.name);
  assert.equal(claude.hooks, "./hooks/claude.json");
  assert.equal(codex.hooks, "./hooks/codex.json");
  assert.equal(existsSync(join(ROOT, "skill-deps.json")), false);
  assert.equal(existsSync(join(ROOT, "hooks", "claude.json")), true);
  assert.equal(existsSync(join(ROOT, "hooks", "codex.json")), true);
  assert.equal(existsSync(join(ROOT, "licenses", "impeccable", "NOTICE.md")), true);
  assert.match(text("licenses/impeccable/NOTICE.md"), /Apache-2\.0/u);
  assert.deepEqual(
    readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(),
    ["interface-craft", "interface-craft-floor", "interface-visual-critique"],
  );
  for (const area of ["src", "skills", "hooks"]) {
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
    const entries = marketplace.plugins.filter((entry: { name: string }) => entry.name === "interface-craft");
    assert.equal(entries.length, 1, path);
  }
});

test("acceptance includes a rendered responsive interface outcome", () => {
  const caseRoot = join(ROOT, "acceptance", "cases", "02-responsive-system");
  assert.equal(existsSync(join(caseRoot, "case.toml")), true);
  assert.equal(existsSync(join(caseRoot, "prompt.md")), true);
  assert.equal(existsSync(join(caseRoot, "expect.sh")), true);
});
