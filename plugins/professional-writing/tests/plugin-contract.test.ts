import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

test("publishes a standalone professional-writing plugin", () => {
  for (const host of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    const manifest = json(host);
    assert.equal(manifest.name, "professional-writing");
    assert.equal(manifest.version, "1.2.0");
    assert.equal("dependencies" in manifest, false);
    assert.equal(manifest.skills, "./skills/");
  }
  assert.equal(existsSync(resolve(root, "skill-deps.json")), false);
  for (const skill of [
    "actionable-response",
    "visual-explanation",
    "writing-terse-output",
    "writing-english-prose",
    "writing-chinese-prose",
    "writing-markdown-ai-style",
    "ai-flavor-remover",
  ]) {
    assert.equal(existsSync(resolve(root, "skills", skill, "SKILL.md")), true, skill);
  }

  for (const upstream of ["show-me", "i-have-adhd"]) {
    assert.equal(existsSync(resolve(root, "licenses", upstream, "LICENSE")), true, upstream);
    assert.equal(existsSync(resolve(root, "licenses", upstream, "NOTICE.md")), true, upstream);
  }
});

test("publishes separate actionable and visual response contracts", () => {
  const actionable = readFileSync(resolve(root, "skills/actionable-response/SKILL.md"), "utf8");
  assert.match(actionable, /next action|next step/iu);
  assert.match(actionable, /numbered|ordered list/iu);
  assert.match(actionable, /do not diagnose|never diagnose|identity assumption/iu);
  assert.match(actionable, /safety|destructive/iu);
  assert.match(actionable, /time estimate.*evidence|invent.*time/iu);
  assert.match(actionable, /default.*user action|by default.*user.*act/isu);
  assert.match(actionable, /do not wait.*ADHD|without.*ADHD/isu);
  assert.doesNotMatch(actionable, /\p{Script=Han}/u);

  const visual = readFileSync(resolve(root, "skills/visual-explanation/SKILL.md"), "utf8");
  assert.match(visual, /smallest.*visual|minimal.*view/iu);
  assert.match(visual, /pseudocode/iu);
  assert.match(visual, /call tree|component tree|file tree/iu);
  assert.match(visual, /Mermaid/u);
  assert.match(visual, /simple.*do not.*visual|do not.*force.*visual/isu);
  assert.match(visual, /do not.*HTML.*by default|default.*do not.*HTML/isu);
  assert.doesNotMatch(visual, /\p{Script=Han}/u);
});
